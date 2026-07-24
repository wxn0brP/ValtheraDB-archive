#!/usr/bin/env perl
use strict;
use warnings;
use FindBin;
use File::Spec;
use File::Path qw(remove_tree make_path);
use lib File::Spec->catdir($FindBin::RealBin, '..', 'lib');
use ValtheraDB::Conduit;

my $root = File::Spec->rel2abs(File::Spec->catdir($FindBin::RealBin, '..', '..'));
my $data_dir = File::Spec->catdir($root, 'perl', 't', 'data', 'main');
remove_tree($data_dir) if -d $data_dir;
make_path($data_dir);

my $platform = $^O eq 'linux' ? ($^O eq 'aarch64' ? 'linux-arm64' : 'linux-x64')
             : $^O eq 'darwin' ? ($^O eq 'aarch64' ? 'darwin-arm64' : 'darwin-x64')
             : 'windows-x64';
my $bin = File::Spec->catfile($root, 'dist', "valtheradb-conduit-$platform");
$bin = File::Spec->catfile($root, 'dist', 'valtheradb-conduit') unless -f $bin;

print "starting conduit from: $bin\n";
my $conduit = ValtheraDB::Conduit->new(binary_path => $bin);
print "ready: ", $conduit->ready, "\n";
print "ping: ", $conduit->ping, "\n";

my $db = $conduit->init('data', $data_dir, { numberId => 0 });
my $users = $db->collection('users');

my $ada = $users->add({ name => 'Ada', lang => 'perl' });
my $bob = $users->add({ name => 'Bob', lang => 'ruby' });
print "inserted: $ada $bob\n";

print "collections: ", join(', ', @{$db->get_collections}), "\n";
print "find Ada: ", $users->find(search => { name => 'Ada' }), "\n";
print "find one Bob: ", $users->find_one(search => { name => 'Bob' }), "\n";

my $updated = $users->update_one(search => { name => 'Ada' }, updater => { lang => 'perl-bridge' });
print "updated Ada: $updated\n";
print "all users: ", $users->find(), "\n";

my $removed = $users->remove_one(search => { name => 'Bob' });
print "removed Bob: $removed\n";
print "after remove: ", $users->find(), "\n";

print "dbs: ", join(', ', @{$conduit->list_dbs}), "\n";
$conduit->shutdown;
print "shutdown ok\n";
