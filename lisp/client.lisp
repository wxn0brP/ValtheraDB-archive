(in-package #:valtheradb-conduit)

(define-condition conduit-error (error)
  ((code :initarg :code :reader conduit-error-code)
   (message :initarg :message :reader conduit-error-message))
  (:report (lambda (c s) (format s "[~A] ~A" (conduit-error-code c) (conduit-error-message c)))))

(defstruct conduit
  (process nil)
  (stdin nil)
  (stdout nil)
  (ready nil)
  (pending (make-hash-table :test 'equal))
  (db-locks (make-hash-table :test 'equal))
  (write-lock (bt:make-lock "write-lock"))
  (shutdown nil))

(defstruct db
  (conduit nil)
  (name ""))

(defstruct collection
  (db nil)
  (name ""))

(defun make-conduit (binary-path &key cwd)
  (let ((process (uiop:launch-program (list binary-path)
                                      :input :stream
                                      :output :stream
                                      :error-output nil
                                      :directory cwd)))
    (let* ((stdin (uiop:process-info-input process))
           (stdout (uiop:process-info-output process))
           (ready-frame (read-frame stdout)))
      (unless (= (getf ready-frame :frame-type) +ready+)
        (error 'conduit-error :code "NOT_READY" :message "did not receive READY"))
      (let ((c (make-conduit-struct
                :process process
                :stdin stdin
                :stdout stdout
                :ready (gethash "result" (getf ready-frame :payload)))))
        c))))

(defun conduit-ready (c) (conduit-struct-ready c))

(defun conduit-shutdown (c)
  (unless (conduit-struct-shutdown c)
    (setf (conduit-struct-shutdown c) t)
    (ignore-errors (conduit-request c "" +shutdown+ (make-hash-table)))
    (close (conduit-struct-stdin c))
    (uiop:wait-process (conduit-struct-process c))))

(defun conduit-close (c) (conduit-shutdown c))

(defun conduit-request (c db-name frame-type payload)
  (when (conduit-struct-shutdown c)
    (error 'conduit-error :code "CLOSED" :message "conduit is shut down"))
  (let ((lock (or (gethash db-name (conduit-struct-db-locks c))
                  (setf (gethash db-name (conduit-struct-db-locks c))
                        (bt:make-lock (format nil "db-lock-~A" db-name))))))
    (bt:with-lock-held (lock)
      (let ((data (encode-frame frame-type db-name payload)))
        (bt:with-lock-held ((conduit-struct-write-lock c))
          (write-sequence data (conduit-struct-stdin c))
          (finish-output (conduit-struct-stdin c)))
        (let ((frame (read-frame (conduit-struct-stdout c))))
          (let ((frame-type (getf frame :frame-type))
                (frame-payload (getf frame :payload)))
            (if (or (= frame-type +error+)
                    (and (gethash "ok" frame-payload)
                         (not (gethash "ok" frame-payload))))
                (error 'conduit-error
                       :code (or (gethash "code" frame-payload) "ERROR")
                       :message (or (gethash "message" frame-payload) "unknown error"))
                (gethash "result" frame-payload))))))))

(defun conduit-init-db (c name dir &optional opts)
  (conduit-request c name +init-db+ (alexandria:plist-hash-table
                                      (list "dir" dir "opts" (or opts (make-hash-table))))))

(defun conduit-list-dbs (c)
  (conduit-request c "" +list-dbs+ (make-hash-table)))

(defun conduit-ping (c)
  (conduit-request c "" +ping+ (make-hash-table)))

(defun conduit-execute (c db-name op &optional body)
  (let ((payload (make-hash-table)))
    (setf (gethash "op" payload) op)
    (when body (setf (gethash "body" payload) body))
    (conduit-request c db-name +execute-json+ payload)))

(defun make-db (conduit name)
  (make-db-struct :conduit conduit :name name))

(defun db-init (db dir &optional opts)
  (conduit-init-db (db-struct-conduit db) (db-struct-name db) dir opts))

(defun db-execute (db op &optional body)
  (conduit-execute (db-struct-conduit db) (db-struct-name db) op body))

(defun db-collection (db name)
  (make-collection-struct :db db :name name))

(defun db-get-collections (db) (db-execute db "getCollections"))
(defun db-ensure-collection (db name) (db-execute db "ensureCollection" name))
(defun db-isset-collection (db name) (db-execute db "issetCollection" name))
(defun db-remove-collection (db name) (db-execute db "removeCollection" name))

(defun db-add (db query) (db-execute db "add" query))
(defun db-find (db &optional query) (db-execute db "find" query))
(defun db-find-one (db query) (db-execute db "findOne" query))
(defun db-update (db query) (db-execute db "update" query))
(defun db-update-one (db query) (db-execute db "updateOne" query))
(defun db-remove (db query) (db-execute db "remove" query))
(defun db-remove-one (db query) (db-execute db "removeOne" query))
(defun db-update-one-or-add (db query) (db-execute db "updateOneOrAdd" query))
(defun db-toggle-one (db query) (db-execute db "toggleOne" query))

(defun db-close (db)
  (conduit-request (db-struct-conduit db) (db-struct-name db) +close-db+ (make-hash-table)))

(defun make-collection (db name)
  (db-collection db name))

(defun collection-add (col data &optional (id-gen t))
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "data" q) data)
    (setf (gethash "id_gen" q) id-gen)
    (db-add (collection-struct-db col) q)))

(defun collection-find (col &key search db-find-opts find-opts context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) (or search (make-hash-table)))
    (setf (gethash "dbFindOpts" q) (or db-find-opts (make-hash-table)))
    (setf (gethash "findOpts" q) (or find-opts (make-hash-table)))
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-find (collection-struct-db col) q)))

(defun collection-find-one (col &key search find-opts context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) (or search (make-hash-table)))
    (setf (gethash "findOpts" q) (or find-opts (make-hash-table)))
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-find-one (collection-struct-db col) q)))

(defun collection-update (col search updater &optional context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) search)
    (setf (gethash "updater" q) updater)
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-update (collection-struct-db col) q)))

(defun collection-update-one (col search updater &optional context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) search)
    (setf (gethash "updater" q) updater)
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-update-one (collection-struct-db col) q)))

(defun collection-remove (col search &optional context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) search)
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-remove (collection-struct-db col) q)))

(defun collection-remove-one (col search &optional context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) search)
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-remove-one (collection-struct-db col) q)))

(defun collection-update-one-or-add (col search updater &key add-arg context (id-gen t))
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) search)
    (setf (gethash "updater" q) updater)
    (setf (gethash "add_arg" q) (or add-arg (make-hash-table)))
    (setf (gethash "context" q) (or context (make-hash-table)))
    (setf (gethash "id_gen" q) id-gen)
    (db-update-one-or-add (collection-struct-db col) q)))

(defun collection-toggle-one (col search &key data context)
  (let ((q (make-hash-table)))
    (setf (gethash "collection" q) (collection-struct-name col))
    (setf (gethash "search" q) search)
    (setf (gethash "data" q) (or data (make-hash-table)))
    (setf (gethash "context" q) (or context (make-hash-table)))
    (db-toggle-one (collection-struct-db col) q)))
