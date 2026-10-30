<?php
/**
 * Unified error handling, mirroring @wxn0brp/db-core/errors.
 * The wire shape matches the response of tools/server (db-core ErrorCodes).
 */

final class ErrorCodes
{
    public const UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION';
    public const ADAPTER_ERROR = 'ADAPTER_ERROR';
    public const ADAPTER_INIT = 'ADAPTER_INIT';
    public const ADAPTER_CLOSE = 'ADAPTER_CLOSE';
    public const QUERY_INVALID = 'QUERY_INVALID';
    public const TRANSACTION_FAILED = 'TRANSACTION_FAILED';
    public const TRANSACTION_ROLLBACK_FAILED = 'TRANSACTION_ROLLBACK_FAILED';
    public const REMOTE_ERROR = 'REMOTE_ERROR';
}

class ValtheraError extends \Exception
{
    public string $errorCode;
    public ?string $suggestion;
    public array $context;

    public function __construct(
        string $message,
        string $errorCode,
        ?string $suggestion = null,
        array $context = [],
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
        $this->errorCode = $errorCode;
        $this->suggestion = $suggestion;
        $this->context = $context;
    }

    public function statusCode(): int
    {
        return match ($this->errorCode) {
            ErrorCodes::QUERY_INVALID, ErrorCodes::UNSUPPORTED_OPERATION => 400,
            default => 500,
        };
    }

    public function toWire(): array
    {
        $wire = [
            'err' => true,
            'msg' => $this->getMessage(),
            'code' => $this->errorCode,
        ];
        if ($this->suggestion !== null)
            $wire['suggestion'] = $this->suggestion;
        if (!empty($this->context))
            $wire['context'] = $this->context;
        return $wire;
    }

    public function withContext(array $context): static
    {
        $this->context = $context + $this->context;
        return $this;
    }
}

class UnsupportedOperationError extends ValtheraError
{
    public function __construct(string $operation, array $context = [])
    {
        parent::__construct(
            "Operation \"{$operation}\" is not supported",
            ErrorCodes::UNSUPPORTED_OPERATION,
            'Check the adapter capabilities before calling this operation',
            [
                'op' => $operation,
            ] + $context,
        );
    }
}

class QueryValidationError extends ValtheraError
{
    public function __construct(string $reason, array $context = [])
    {
        parent::__construct(
            $reason,
            ErrorCodes::QUERY_INVALID,
            'Check the query shape and the collection name',
            $context,
        );
    }
}

class AdapterError extends ValtheraError
{
    public function __construct($cause, array $context = [])
    {
        parent::__construct(
            errorMessage($cause),
            ErrorCodes::ADAPTER_ERROR,
            null,
            $context,
            $cause instanceof \Throwable ? $cause : null,
        );
    }
}

class AdapterInitError extends ValtheraError
{
    public function __construct($cause, array $context = [])
    {
        parent::__construct(
            'Adapter init failed: ' . errorMessage($cause),
            ErrorCodes::ADAPTER_INIT,
            null,
            $context,
            $cause instanceof \Throwable ? $cause : null,
        );
    }
}

class AdapterCloseError extends ValtheraError
{
    public function __construct($cause, array $context = [])
    {
        parent::__construct(
            'Adapter close failed: ' . errorMessage($cause),
            ErrorCodes::ADAPTER_CLOSE,
            null,
            $context,
            $cause instanceof \Throwable ? $cause : null,
        );
    }
}

function errorMessage($cause): string
{
    return $cause instanceof \Throwable ? $cause->getMessage() : (string) $cause;
}

function isValtheraError($err): bool
{
    return $err instanceof ValtheraError;
}

/**
 * Keep ValtheraError codes, otherwise wrap into AdapterError.
 */
function wrapAdapterError($cause, array $context = []): ValtheraError
{
    if ($cause instanceof ValtheraError)
        return empty($context) ? $cause : $cause->withContext($context);
    return new AdapterError($cause, $context);
}
