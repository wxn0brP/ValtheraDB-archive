package conduit

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

const (
	InitDb       = 1
	ExecuteJson  = 2
	CloseDb      = 3
	ListDbs      = 4
	Ping         = 5
	Shutdown     = 6
	Ready        = 100
	Result       = 101
	Error        = 102
	Pong         = 104
)

type response struct {
	result interface{}
	err    error
}

type Conduit struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	ready     interface{}
	pending   map[string][]chan response
	pendingMu sync.Mutex
	dbLocks   map[string]*sync.Mutex
	dbLocksMu sync.Mutex
	writeLock sync.Mutex
	done      chan struct{}
}

func New(binaryPath string) (*Conduit, error) {
	return NewWithArgs(binaryPath, nil)
}

func NewWithArgs(binaryPath string, args []string) (*Conduit, error) {
	cmd := exec.Command(binaryPath, args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = io.Discard

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(stdout)
	readyFrame, err := ReadFrame(reader)
	if err != nil {
		cmd.Process.Kill()
		return nil, fmt.Errorf("reading READY: %w", err)
	}
	if readyFrame.FrameType != Ready {
		cmd.Process.Kill()
		return nil, NewProtocolError("did not receive READY")
	}

	c := &Conduit{
		cmd:     cmd,
		stdin:   stdin,
		ready:   readyFrame.Payload["result"],
		pending: make(map[string][]chan response),
		dbLocks: make(map[string]*sync.Mutex),
		done:    make(chan struct{}),
	}

	go c.readLoop(reader)
	return c, nil
}

func (c *Conduit) Db(name string) *Db {
	return &Db{conduit: c, name: name}
}

func (c *Conduit) Init(name, dir string, opts map[string]interface{}) (*Db, error) {
	db := c.Db(name)
	if err := db.init(dir, opts); err != nil {
		return nil, err
	}
	return db, nil
}

func (c *Conduit) CloseDb(name string) (interface{}, error) {
	return c.request(name, CloseDb, map[string]interface{}{})
}

func (c *Conduit) ListDbs() ([]string, error) {
	result, err := c.request("", ListDbs, map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	if arr, ok := result.([]interface{}); ok {
		out := make([]string, 0, len(arr))
		for _, v := range arr {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
		return out, nil
	}
	return nil, nil
}

func (c *Conduit) Ping() (interface{}, error) {
	return c.request("", Ping, map[string]interface{}{})
}

func (c *Conduit) Ready() interface{} {
	return c.ready
}

func (c *Conduit) Execute(db, op string, body interface{}) (interface{}, error) {
	payload := map[string]interface{}{"op": op}
	if body != nil {
		payload["body"] = body
	}
	return c.request(db, ExecuteJson, payload)
}

func (c *Conduit) Shutdown() error {
	select {
	case <-c.done:
		return nil
	default:
	}
	c.request("", Shutdown, map[string]interface{}{})
	c.stdin.Close()
	c.cmd.Wait()
	<-c.done
	return nil
}

func (c *Conduit) request(dbName string, frameType uint32, payload interface{}) (interface{}, error) {
	lock := c.lockFor(dbName)
	lock.Lock()
	defer lock.Unlock()

	ch := make(chan response, 1)
	c.pendingMu.Lock()
	c.pending[dbName] = append(c.pending[dbName], ch)
	c.pendingMu.Unlock()

	data, err := EncodeFrame(frameType, dbName, payload)
	if err != nil {
		return nil, err
	}

	c.writeLock.Lock()
	_, err = c.stdin.Write(data)
	c.writeLock.Unlock()
	if err != nil {
		return nil, err
	}

	select {
	case resp := <-ch:
		return resp.result, resp.err
	case <-time.After(30 * time.Second):
		return nil, &ConduitError{Code: "TIMEOUT", Message: "request timed out"}
	}
}

func (c *Conduit) lockFor(dbName string) *sync.Mutex {
	c.dbLocksMu.Lock()
	defer c.dbLocksMu.Unlock()
	if _, ok := c.dbLocks[dbName]; !ok {
		c.dbLocks[dbName] = &sync.Mutex{}
	}
	return c.dbLocks[dbName]
}

func (c *Conduit) readLoop(reader *bufio.Reader) {
	defer close(c.done)
	for {
		frame, err := ReadFrame(reader)
		if err != nil {
			c.pendingMu.Lock()
			for _, queue := range c.pending {
				for _, ch := range queue {
					select {
					case ch <- response{err: &ConduitError{Code: "CLOSED", Message: "conduit closed"}}:
					default:
					}
				}
			}
			c.pendingMu.Unlock()
			return
		}
		c.resolve(frame)
	}
}

func (c *Conduit) resolve(frame *Frame) {
	c.pendingMu.Lock()
	queue := c.pending[frame.DbName]
	if len(queue) == 0 {
		c.pendingMu.Unlock()
		return
	}
	ch := queue[0]
	c.pending[frame.DbName] = queue[1:]
	c.pendingMu.Unlock()

	payload := frame.Payload
	if frame.FrameType == Error || payload["ok"] == false {
		code, _ := payload["code"].(string)
		message, _ := payload["message"].(string)
		if code == "" {
			code = "ERROR"
		}
		if message == "" {
			message = "unknown error"
		}
		ch <- response{err: NewServerError(code, message, payload["details"])}
	} else {
		ch <- response{result: payload["result"]}
	}
}

type Db struct {
	conduit *Conduit
	name    string
}

func (d *Db) init(dir string, opts map[string]interface{}) error {
	if opts == nil {
		opts = map[string]interface{}{}
	}
	_, err := d.conduit.request(d.name, InitDb, map[string]interface{}{"dir": dir, "opts": opts})
	return err
}

func (d *Db) Execute(op string, body interface{}) (interface{}, error) {
	payload := map[string]interface{}{"op": op}
	if body != nil {
		payload["body"] = body
	}
	return d.conduit.request(d.name, ExecuteJson, payload)
}

func (d *Db) C(name string) *Collection {
	return &Collection{db: d, name: name}
}

func (d *Db) Collection(name string) *Collection {
	return d.C(name)
}

func (d *Db) GetCollections() ([]string, error) {
	result, err := d.Execute("getCollections", nil)
	if err != nil {
		return nil, err
	}
	if arr, ok := result.([]interface{}); ok {
		out := make([]string, 0, len(arr))
		for _, v := range arr {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
		return out, nil
	}
	return nil, nil
}

func (d *Db) EnsureCollection(name string) (bool, error) {
	result, err := d.Execute("ensureCollection", name)
	if err != nil {
		return false, err
	}
	b, _ := result.(bool)
	return b, nil
}

func (d *Db) IssetCollection(name string) (bool, error) {
	result, err := d.Execute("issetCollection", name)
	if err != nil {
		return false, err
	}
	b, _ := result.(bool)
	return b, nil
}

func (d *Db) RemoveCollection(name string) (bool, error) {
	result, err := d.Execute("removeCollection", name)
	if err != nil {
		return false, err
	}
	b, _ := result.(bool)
	return b, nil
}

func (d *Db) Add(query interface{}) (interface{}, error) {
	return d.Execute("add", query)
}

func (d *Db) Find(query interface{}) (interface{}, error) {
	return d.Execute("find", query)
}

func (d *Db) FindOne(query interface{}) (interface{}, error) {
	return d.Execute("findOne", query)
}

func (d *Db) Update(query interface{}) (interface{}, error) {
	return d.Execute("update", query)
}

func (d *Db) UpdateOne(query interface{}) (interface{}, error) {
	return d.Execute("updateOne", query)
}

func (d *Db) Remove(query interface{}) (interface{}, error) {
	return d.Execute("remove", query)
}

func (d *Db) RemoveOne(query interface{}) (interface{}, error) {
	return d.Execute("removeOne", query)
}

func (d *Db) UpdateOneOrAdd(query interface{}) (interface{}, error) {
	return d.Execute("updateOneOrAdd", query)
}

func (d *Db) ToggleOne(query interface{}) (interface{}, error) {
	return d.Execute("toggleOne", query)
}

func (d *Db) Close() (interface{}, error) {
	return d.conduit.request(d.name, CloseDb, map[string]interface{}{})
}

type Collection struct {
	db   *Db
	name string
}

func (c *Collection) Add(data map[string]interface{}, idGen bool) (interface{}, error) {
	return c.db.Add(map[string]interface{}{"collection": c.name, "data": data, "id_gen": idGen})
}

func (c *Collection) Find(search, dbFindOpts, findOpts, context map[string]interface{}) (interface{}, error) {
	if search == nil {
		search = map[string]interface{}{}
	}
	if dbFindOpts == nil {
		dbFindOpts = map[string]interface{}{}
	}
	if findOpts == nil {
		findOpts = map[string]interface{}{}
	}
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.Find(map[string]interface{}{
		"collection": c.name, "search": search, "dbFindOpts": dbFindOpts,
		"findOpts": findOpts, "context": context,
	})
}

func (c *Collection) FindOne(search, findOpts, context map[string]interface{}) (interface{}, error) {
	if search == nil {
		search = map[string]interface{}{}
	}
	if findOpts == nil {
		findOpts = map[string]interface{}{}
	}
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.FindOne(map[string]interface{}{
		"collection": c.name, "search": search,
		"findOpts": findOpts, "context": context,
	})
}

func (c *Collection) Update(search, updater, context map[string]interface{}) (interface{}, error) {
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.Update(map[string]interface{}{
		"collection": c.name, "search": search, "updater": updater, "context": context,
	})
}

func (c *Collection) UpdateOne(search, updater, context map[string]interface{}) (interface{}, error) {
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.UpdateOne(map[string]interface{}{
		"collection": c.name, "search": search, "updater": updater, "context": context,
	})
}

func (c *Collection) Remove(search, context map[string]interface{}) (interface{}, error) {
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.Remove(map[string]interface{}{
		"collection": c.name, "search": search, "context": context,
	})
}

func (c *Collection) RemoveOne(search, context map[string]interface{}) (interface{}, error) {
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.RemoveOne(map[string]interface{}{
		"collection": c.name, "search": search, "context": context,
	})
}

func (c *Collection) UpdateOneOrAdd(search, updater map[string]interface{}, addArg map[string]interface{}, context map[string]interface{}, idGen bool) (interface{}, error) {
	if addArg == nil {
		addArg = map[string]interface{}{}
	}
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.UpdateOneOrAdd(map[string]interface{}{
		"collection": c.name, "search": search, "updater": updater,
		"add_arg": addArg, "context": context, "id_gen": idGen,
	})
}

func (c *Collection) ToggleOne(search map[string]interface{}, data, context map[string]interface{}) (interface{}, error) {
	if data == nil {
		data = map[string]interface{}{}
	}
	if context == nil {
		context = map[string]interface{}{}
	}
	return c.db.ToggleOne(map[string]interface{}{
		"collection": c.name, "search": search, "data": data, "context": context,
	})
}

func init() {
	_ = json.Marshal
}
