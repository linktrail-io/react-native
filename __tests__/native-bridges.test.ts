/* eslint-env jest */
// Source checks for the native bridges (Kotlin / Swift), which Jest can't run: error-code
// mapping, error details, the iOS SDK header call, and the native pins.
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (path: string) =>
  readFileSync(join(__dirname, '..', path), 'utf8');
const pkg = require('../package.json') as { version: string };

const kotlin = read(
  'android/src/main/java/io/linktrail/reactnative/LinkTrailModule.kt',
);
const swift = read('ios/LinkTrailModuleImpl.swift');

/** The body of a Kotlin `fun name(...)` or Swift `func name(...)`, up to the next declaration. */
function body(source: string, name: string): string {
  const start = source.search(new RegExp(`\\bfunc? ${name}\\(`));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const next = rest.search(
    /\n {2}(?:@objc |private |public |override |static )*(?:func?|val|var) /,
  );
  return next < 0 ? rest : rest.slice(0, next);
}

describe('Android bridge', () => {
  it('maps LinkTrailError.InvalidEvent to invalidEvent, before the unknown fallback', () => {
    const mapping = body(kotlin, 'errorCode');
    expect(mapping).toMatch(
      /is LinkTrailError\.InvalidEvent -> "invalidEvent"/,
    );
    expect(mapping.indexOf('InvalidEvent')).toBeLessThan(
      mapping.indexOf('else -> "unknown"'),
    );
  });

  it('passes reason for InvalidEvent in the error details (reject + onError)', () => {
    const details = body(kotlin, 'errorDetails');
    expect(details).toMatch(
      /is LinkTrailError\.InvalidEvent -> [\s\S]*putString\("reason", error\.reason\)/,
    );
    expect(body(kotlin, 'reject')).toContain('errorDetails(error)');
    expect(body(kotlin, 'configure')).toContain('errorDetails(error)');
  });

  it('sets the wrapper platform before configure', () => {
    const configure = body(kotlin, 'configure');
    const header = configure.indexOf(
      'LinkTrailWrapper.setPlatform("react-native", BuildConfig.LINKTRAIL_RN_VERSION)',
    );
    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(configure.indexOf('LinkTrail.configure('));
  });

  it('pins io.linktrail:sdk:0.2.0 exactly', () => {
    expect(read('android/build.gradle')).toMatch(
      /implementation "io\.linktrail:sdk:0\.2\.0"/,
    );
  });
});

describe('iOS bridge', () => {
  it('maps .invalidEvent to invalidEvent', () => {
    expect(body(swift, 'errorCode')).toMatch(
      /case \.invalidEvent: return "invalidEvent"/,
    );
  });

  it('passes reason for .invalidEvent in the error user info (reject + onError)', () => {
    expect(body(swift, 'errorUserInfo')).toMatch(
      /case let \.invalidEvent\(reason\)\?:\s*return \["reason": reason\]/,
    );
    expect(body(swift, 'errorPayload')).toContain('errorUserInfo(error)');
  });

  it('calls setSDKIdentifier(platform: "react-native") before configure', () => {
    const configure = body(swift, 'configure');
    const header = configure.indexOf(
      'LinkTrailSDK.LinkTrail.setSDKIdentifier(platform: "react-native", version: Self.wrapperVersion)',
    );
    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(
      configure.indexOf('LinkTrailSDK.LinkTrail.configure('),
    );
  });

  it('sends the package.json version in the header', () => {
    expect(swift).toContain(`static let wrapperVersion = "${pkg.version}"`);
  });

  it('pins LinkTrailSDK ~> 0.2.0', () => {
    expect(read('LinktrailReactNative.podspec')).toMatch(
      /s\.dependency "LinkTrailSDK", "~> 0\.2\.0"/,
    );
  });
});

describe('legacyCode removal', () => {
  it.each(['src/errors.ts', 'src/index.ts', 'src/types.ts', 'README.md'])(
    '%s no longer mentions legacyCode',
    (path) => {
      expect(read(path)).not.toMatch(/legacyCode|LinkTrailLegacyErrorCode/);
    },
  );
});
