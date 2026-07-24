(ql:quickload :valtheradb-conduit)

(defun main ()
  (let* ((root (uiop:pathname-parent-directory-pathname
                (uiop:pathname-parent-directory-pathname
                 (uiop:pathname-parent-directory-pathname
                  (uiop:pathname-parent-directory-pathname *load-pathname*)))))
         (data-dir (merge-pathnames "lisp/test/data/main/" root)))
    (when (uiop:directory-exists-p data-dir)
      (uiop:delete-directory-tree data-dir :validate t))
    (ensure-directories-exist data-dir)

    (let ((bin (merge-pathnames "dist/valtheradb-conduit" root)))
      (format t "starting conduit from: ~A~%" bin)
      (let ((c (valtheradb-conduit:make-conduit (namestring bin))))
        (format t "ready: ~A~%" (valtheradb-conduit:conduit-ready c))
        (format t "ping: ~A~%" (valtheradb-conduit:conduit-ping c))

        (let* ((db (valtheradb-conduit:make-db c "data"))
               (users (valtheradb-conduit:db-collection db "users")))
          (valtheradb-conduit:db-init db (namestring data-dir)
                                       (alexandria:plist-hash-table (list "numberId" nil)))

          (let ((ada (valtheradb-conduit:collection-add users
                         (alexandria:plist-hash-table (list "name" "Ada" "lang" "lisp"))))
                (bob (valtheradb-conduit:collection-add users
                         (alexandria:plist-hash-table (list "name" "Bob" "lang" "clojure")))))
            (format t "inserted: ~A ~A~%" ada bob))

          (format t "collections: ~A~%" (valtheradb-conduit:db-get-collections db))
          (format t "find Ada: ~A~%" (valtheradb-conduit:collection-find users
                          :search (alexandria:plist-hash-table (list "name" "Ada"))))
          (format t "find one Bob: ~A~%" (valtheradb-conduit:collection-find-one users
                          :search (alexandria:plist-hash-table (list "name" "Bob"))))

          (let ((updated (valtheradb-conduit:collection-update-one users
                          (alexandria:plist-hash-table (list "name" "Ada"))
                          (alexandria:plist-hash-table (list "lang" "lisp-bridge")))))
            (format t "updated Ada: ~A~%" updated))

          (format t "all users: ~A~%" (valtheradb-conduit:collection-find users))

          (let ((removed (valtheradb-conduit:collection-remove-one users
                          (alexandria:plist-hash-table (list "name" "Bob")))))
            (format t "removed Bob: ~A~%" removed))

          (format t "after remove: ~A~%" (valtheradb-conduit:collection-find users))

          (format t "dbs: ~A~%" (valtheradb-conduit:conduit-list-dbs c))
          (valtheradb-conduit:conduit-shutdown c)
          (format t "shutdown ok~%"))))))

(main)
