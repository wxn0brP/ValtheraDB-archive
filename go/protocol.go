package conduit

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

const HeaderSize = 12

type Frame struct {
	FrameType uint32
	DbName    string
	Payload   map[string]interface{}
}

func EncodeFrame(frameType uint32, dbName string, payload interface{}) ([]byte, error) {
	dbNameBytes := []byte(dbName)
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	binary.Write(&buf, binary.LittleEndian, frameType)
	binary.Write(&buf, binary.LittleEndian, uint32(len(dbNameBytes)))
	binary.Write(&buf, binary.LittleEndian, uint32(len(payloadBytes)))
	buf.Write(dbNameBytes)
	buf.Write(payloadBytes)
	return buf.Bytes(), nil
}

func ReadFrame(r io.Reader) (*Frame, error) {
	header := make([]byte, HeaderSize)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}
	frameType := binary.LittleEndian.Uint32(header[0:4])
	dbNameLen := binary.LittleEndian.Uint32(header[4:8])
	payloadLen := binary.LittleEndian.Uint32(header[8:12])

	dbNameBytes := make([]byte, dbNameLen)
	if dbNameLen > 0 {
		if _, err := io.ReadFull(r, dbNameBytes); err != nil {
			return nil, err
		}
	}

	payloadBytes := make([]byte, payloadLen)
	if payloadLen > 0 {
		if _, err := io.ReadFull(r, payloadBytes); err != nil {
			return nil, err
		}
	}

	var payload map[string]interface{}
	if len(payloadBytes) > 0 {
		if err := json.Unmarshal(payloadBytes, &payload); err != nil {
			return nil, fmt.Errorf("json decode: %w", err)
		}
	} else {
		payload = map[string]interface{}{}
	}

	return &Frame{
		FrameType: frameType,
		DbName:    string(dbNameBytes),
		Payload:   payload,
	}, nil
}
