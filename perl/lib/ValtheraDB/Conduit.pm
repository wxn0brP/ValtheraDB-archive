package ValtheraDB::Conduit;
use strict;
use warnings;
use IPC::Open3;
use JSON::PP;
use Symbol qw(gensym);

our $VERSION = '0.1.0';

use constant {
    INIT_DB      => 1,
    EXECUTE_JSON => 2,
    CLOSE_DB     => 3,
    LIST_DBS     => 4,
    PING         => 5,
    SHUTDOWN     => 6,
    READY        => 100,
    RESULT       => 101,
    ERROR        => 102,
    PONG         => 104,
};

sub new {
    my ($class, %args) = @_;
    my $binary = $args{binary_path} or die "binary_path required";

    my @cmd = ($binary);
    push @cmd, @{$args{args} || []};

    my ($wtr, $rdr);
    my $pid = open3($wtr, $rdr, '>&STDERR', @cmd);
    binmode($wtr);
    binmode($rdr);

    my $ready_frame = _read_frame($rdr);
    die "did not receive READY" unless $ready_frame->{frame_type} == READY;

    my $self = bless {
        pid      => $pid,
        wtr      => $wtr,
        rdr      => $rdr,
        ready    => $ready_frame->{payload}{result} || {},
        json     => JSON::PP->new->utf8->canonical,
        shutdown => 0,
    }, $class;

    return $self;
}

sub ready { $_[0]->{ready} }

sub init {
    my ($self, $name, $dir, $opts) = @_;
    $self->_request($name, INIT_DB, { dir => $dir, opts => $opts || {} });
    return ValtheraDB::Conduit::Db->new($self, $name);
}

sub close_db {
    my ($self, $name) = @_;
    return $self->_request($name, CLOSE_DB, {});
}

sub list_dbs {
    my ($self) = @_;
    return $self->_request("", LIST_DBS, {});
}

sub ping {
    my ($self) = @_;
    return $self->_request("", PING, {});
}

sub execute {
    my ($self, $db, $op, $body) = @_;
    my $payload = { op => $op };
    $payload->{body} = $body if defined $body;
    return $self->_request($db, EXECUTE_JSON, $payload);
}

sub shutdown {
    my ($self) = @_;
    return if $self->{shutdown};
    $self->{shutdown} = 1;
    eval { $self->_request("", SHUTDOWN, {}) };
    close($self->{wtr});
    waitpid($self->{pid}, 0) if $self->{pid};
}

sub DESTROY {
    my ($self) = @_;
    $self->shutdown() unless $self->{shutdown};
}

sub _request {
    my ($self, $db_name, $frame_type, $req_payload) = @_;
    die "conduit is shut down" if $self->{shutdown};

    my $data = _encode_frame($frame_type, $db_name, $req_payload, $self->{json});
    syswrite($self->{wtr}, $data);

    my $frame = _read_frame($self->{rdr});
    my $payload = $frame->{payload};

    if ($frame->{frame_type} == ERROR || (exists $payload->{ok} && !$payload->{ok})) {
        die ValtheraDB::Conduit::Error->new(
            code    => $payload->{code}    || 'ERROR',
            message => $payload->{message} || 'unknown error',
            details => $payload->{details},
        );
    }
    return $payload->{result};
}

sub _encode_frame {
    my ($frame_type, $db_name, $payload, $json) = @_;
    my $db_bytes = _encode_utf8($db_name // '');
    my $body = $json->encode($payload || {});
    my $body_bytes = _encode_utf8($body);
    return pack("VVV", $frame_type, length($db_bytes), length($body_bytes)) . $db_bytes . $body_bytes;
}

sub _read_frame {
    my ($rdr) = @_;
    my $header = _read_exact($rdr, 12);
    my ($frame_type, $db_name_len, $payload_len) = unpack("VVV", $header);

    my $db_name = '';
    if ($db_name_len > 0) {
        $db_name = _decode_utf8(_read_exact($rdr, $db_name_len));
    }

    my $payload = {};
    if ($payload_len > 0) {
        my $raw = _read_exact($rdr, $payload_len);
        $payload = decode_json($raw);
    }

    return { frame_type => $frame_type, db_name => $db_name, payload => $payload };
}

sub _read_exact {
    my ($fh, $size) = @_;
    my $buf = '';
    while (length($buf) < $size) {
        my $n = sysread($fh, $buf, $size - length($buf), length($buf));
        die "unexpected EOF" unless defined $n && $n > 0;
    }
    return $buf;
}

sub _encode_utf8 {
    my ($s) = @_;
    utf8::encode($s) if utf8::is_utf8($s);
    return $s;
}

sub _decode_utf8 {
    my ($s) = @_;
    utf8::decode($s);
    return $s;
}

package ValtheraDB::Conduit::Error;
use overload '""' => sub { "[$_[0]->{code}] $_[0]->{message}" };

sub new {
    my ($class, %args) = @_;
    return bless { code => $args{code}, message => $args{message}, details => $args{details} }, $class;
}

sub code    { $_[0]->{code} }
sub message { $_[0]->{message} }
sub details { $_[0]->{details} }

package ValtheraDB::Conduit::Db;
sub new {
    my ($class, $conduit, $name) = @_;
    return bless { conduit => $conduit, name => $name }, $class;
}

sub execute {
    my ($self, $op, $body) = @_;
    return $self->{conduit}->execute($self->{name}, $op, $body);
}

sub c          { ValtheraDB::Conduit::Collection->new($_[0], $_[1]) }
sub collection { ValtheraDB::Conduit::Collection->new($_[0], $_[1]) }

sub get_collections    { $_[0]->execute("getCollections") }
sub ensure_collection  { $_[0]->execute("ensureCollection", $_[1]) }
sub isset_collection   { $_[0]->execute("issetCollection", $_[1]) }
sub remove_collection  { $_[0]->execute("removeCollection", $_[1]) }

sub add                { $_[0]->execute("add", $_[1]) }
sub find               { $_[0]->execute("find", $_[1]) }
sub find_one           { $_[0]->execute("findOne", $_[1]) }
sub findOne            { $_[0]->find_one($_[1]) }
sub update             { $_[0]->execute("update", $_[1]) }
sub update_one         { $_[0]->execute("updateOne", $_[1]) }
sub updateOne          { $_[0]->update_one($_[1]) }
sub remove             { $_[0]->execute("remove", $_[1]) }
sub remove_one         { $_[0]->execute("removeOne", $_[1]) }
sub removeOne          { $_[0]->remove_one($_[1]) }
sub update_one_or_add  { $_[0]->execute("updateOneOrAdd", $_[1]) }
sub updateOneOrAdd     { $_[0]->update_one_or_add($_[1]) }
sub toggle_one         { $_[0]->execute("toggleOne", $_[1]) }
sub toggleOne          { $_[0]->toggle_one($_[1]) }

sub close { $_[0]->{conduit}->close_db($_[0]->{name}) }

package ValtheraDB::Conduit::Collection;
sub new {
    my ($class, $db, $name) = @_;
    return bless { db => $db, name => $name }, $class;
}

sub add {
    my ($self, $data, $id_gen) = @_;
    $id_gen = 1 unless defined $id_gen;
    return $self->{db}->add({ collection => $self->{name}, data => $data, id_gen => $id_gen });
}

sub find {
    my ($self, %opts) = @_;
    return $self->{db}->find({
        collection => $self->{name},
        search     => $opts{search}     || {},
        dbFindOpts => $opts{db_find_opts} || {},
        findOpts   => $opts{find_opts}  || {},
        context    => $opts{context}    || {},
    });
}

sub find_one {
    my ($self, %opts) = @_;
    return $self->{db}->find_one({
        collection => $self->{name},
        search     => $opts{search}    || {},
        findOpts   => $opts{find_opts} || {},
        context    => $opts{context}   || {},
    });
}
sub findOne { shift->find_one(@_) }

sub update {
    my ($self, %opts) = @_;
    return $self->{db}->update({
        collection => $self->{name},
        search     => $opts{search},
        updater    => $opts{updater},
        context    => $opts{context} || {},
    });
}

sub update_one {
    my ($self, %opts) = @_;
    return $self->{db}->update_one({
        collection => $self->{name},
        search     => $opts{search},
        updater    => $opts{updater},
        context    => $opts{context} || {},
    });
}
sub updateOne { shift->update_one(@_) }

sub remove {
    my ($self, %opts) = @_;
    return $self->{db}->remove({
        collection => $self->{name},
        search     => $opts{search},
        context    => $opts{context} || {},
    });
}

sub remove_one {
    my ($self, %opts) = @_;
    return $self->{db}->remove_one({
        collection => $self->{name},
        search     => $opts{search},
        context    => $opts{context} || {},
    });
}
sub removeOne { shift->remove_one(@_) }

sub update_one_or_add {
    my ($self, %opts) = @_;
    return $self->{db}->update_one_or_add({
        collection => $self->{name},
        search     => $opts{search},
        updater    => $opts{updater},
        add_arg    => $opts{add_arg} || {},
        context    => $opts{context} || {},
        id_gen     => $opts{id_gen}  // 1,
    });
}
sub updateOneOrAdd { shift->update_one_or_add(@_) }

sub toggle_one {
    my ($self, %opts) = @_;
    return $self->{db}->toggle_one({
        collection => $self->{name},
        search     => $opts{search},
        data       => $opts{data}    || {},
        context    => $opts{context} || {},
    });
}
sub toggleOne { shift->toggle_one(@_) }

1;
