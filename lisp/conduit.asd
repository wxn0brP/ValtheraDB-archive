(asdf:defsystem #:valtheradb-conduit
  :description "Common Lisp client for ValtheraDB Conduit"
  :version "0.1.0"
  :author "wxn0brP"
  :license "MIT"
  :depends-on (#-sbcl #:bordeaux-threads
               #:cl-json)
  :serial t
  :components ((:file "package")
               (:file "protocol")
               (:file "client")))
