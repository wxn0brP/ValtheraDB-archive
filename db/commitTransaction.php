<?php
/**
 * Transactions need per-request state, which this stateless server cannot keep,
 * so the operation is rejected with a proper UNSUPPORTED_OPERATION wire error.
 */
require_once __DIR__ . '/../utils/utils.php';

errorResponse(new UnsupportedOperationError('commitTransaction'));
