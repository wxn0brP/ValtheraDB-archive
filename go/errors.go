package conduit

import "fmt"

type ConduitError struct {
	Code    string
	Message string
	Details interface{}
}

func (e *ConduitError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func NewProtocolError(msg string) *ConduitError {
	return &ConduitError{Code: "PROTOCOL", Message: msg}
}

func NewServerError(code, message string, details interface{}) *ConduitError {
	return &ConduitError{Code: code, Message: message, Details: details}
}
