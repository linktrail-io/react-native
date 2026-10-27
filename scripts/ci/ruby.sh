#!/usr/bin/env bash
# A Ruby + bundler for this CI job only, on a shared self-hosted Mac. Replaces ruby/setup-ruby, whose
# prebuilt Rubies only install on GitHub-hosted images.
#
#   bash scripts/ci/ruby.sh            then: bundle install / bundle exec pod … (in example/)
#
# Gems go to $RUNNER_TEMP (GEM_HOME, BUNDLE_PATH, BUNDLE_APP_CONFIG), so nothing is installed globally
# and nothing is left on the Mac. The system Ruby (2.6) is too old for CocoaPods' dependencies, so this
# uses Homebrew's Ruby: the `ruby` formula when installed, else the portable Ruby Homebrew ships for
# itself. Exports to the later steps through $GITHUB_ENV and $GITHUB_PATH.
set -euo pipefail
: "${RUNNER_TEMP:?RUNNER_TEMP is not set}"

BREW="$(command -v brew || true)"
for c in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -n "$BREW" ] && break
  [ -x "$c" ] && BREW="$c"
done
[ -n "$BREW" ] || { echo "::error::Homebrew not found on this runner; it provides the Ruby for CocoaPods."; exit 1; }

RUBY_BIN=""
for d in "$("$BREW" --prefix ruby 2>/dev/null || true)/bin" "$("$BREW" --repository)/Library/Homebrew/vendor/portable-ruby/current/bin"; do
  if [ -x "$d/ruby" ] && "$d/ruby" -e 'exit(RUBY_VERSION >= "3.1" ? 0 : 1)'; then RUBY_BIN="$d"; break; fi
done
[ -n "$RUBY_BIN" ] || { echo "::error::No Ruby >= 3.1 from Homebrew on this runner (brew install ruby, or run any brew command once to fetch its portable Ruby)."; exit 1; }

ROOT="$RUNNER_TEMP/ruby"
rm -rf "$ROOT"; mkdir -p "$ROOT/gems/bin"
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "GEM_HOME=$ROOT/gems"
    echo "GEM_PATH=$ROOT/gems"
    echo "BUNDLE_PATH=$ROOT/bundle"
    echo "BUNDLE_APP_CONFIG=$ROOT/bundle-config"
    echo "CP_HOME_DIR=$ROOT/cocoapods-home"
  } >> "$GITHUB_ENV"
fi
if [ -n "${GITHUB_PATH:-}" ]; then
  { echo "$ROOT/gems/bin"; echo "$RUBY_BIN"; } >> "$GITHUB_PATH"
fi
echo "Ruby $("$RUBY_BIN/ruby" -e 'print RUBY_VERSION') ($RUBY_BIN), gems in $ROOT"
