package conduit

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

func main() {
	root := filepath.Dir(filepath.Dir(must(os.Getwd())))
	dataDir := filepath.Join(root, "go", "test", "data", "main")
	os.RemoveAll(dataDir)
	os.MkdirAll(dataDir, 0755)

	bin := findBinary(root)
	fmt.Println("starting conduit from:", bin)

	c, err := New(bin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to start conduit:", err)
		os.Exit(1)
	}
	defer c.Shutdown()

	fmt.Println("ready:", c.ready)
	pong, _ := c.Ping()
	fmt.Println("ping:", pong)

	db, err := c.Init("data", dataDir, map[string]interface{}{"numberId": false})
	if err != nil {
		fmt.Fprintln(os.Stderr, "init failed:", err)
		os.Exit(1)
	}

	users := db.Collection("users")

	ada, _ := users.Add(map[string]interface{}{"name": "Ada", "lang": "go"}, true)
	bob, _ := users.Add(map[string]interface{}{"name": "Bob", "lang": "rust"}, true)
	fmt.Println("inserted:", ada, bob)

	cols, _ := db.GetCollections()
	fmt.Println("collections:", cols)

	found, _ := users.Find(map[string]interface{}{"name": "Ada"}, nil, nil, nil)
	fmt.Println("find Ada:", found)

	foundOne, _ := users.FindOne(map[string]interface{}{"name": "Bob"}, nil, nil)
	fmt.Println("find one Bob:", foundOne)

	updated, _ := users.UpdateOne(
		map[string]interface{}{"name": "Ada"},
		map[string]interface{}{"lang": "go-bridge"},
		nil,
	)
	fmt.Println("updated Ada:", updated)

	all, _ := users.Find(nil, nil, nil, nil)
	fmt.Println("all users:", all)

	removed, _ := users.RemoveOne(map[string]interface{}{"name": "Bob"}, nil)
	fmt.Println("removed Bob:", removed)

	after, _ := users.Find(nil, nil, nil, nil)
	fmt.Println("after remove:", after)

	dbs, _ := c.ListDbs()
	fmt.Println("dbs:", dbs)

	fmt.Println("shutdown ok")
}

func findBinary(root string) string {
	platform := runtime.GOOS + "-" + archName()
	name := fmt.Sprintf("valtheradb-conduit-%s", platform)
	p := filepath.Join(root, "dist", name)
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return filepath.Join(root, "dist", "valtheradb-conduit")
}

func archName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "x64"
	case "arm64":
		return "arm64"
	default:
		return runtime.GOARCH
	}
}

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}
