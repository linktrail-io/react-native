// The codegen spec header (and the -Swift.h bridge) are C++-heavy; importing
// them only from this ObjC++ (.mm) translation unit — never from a public
// header — keeps them out of the pod's Clang module umbrella, which otherwise
// fails to build (libc++ headers unresolved under explicit modules).
#if __has_include(<LinkTrailSpec/LinkTrailSpec.h>)
#import <LinkTrailSpec/LinkTrailSpec.h>
#else
#import "LinkTrailSpec.h"
#endif

#if __has_include("LinktrailReactNative-Swift.h")
#import "LinktrailReactNative-Swift.h"
#else
#import <LinktrailReactNative/LinktrailReactNative-Swift.h>
#endif

// TurboModule registered as "LinkTrail". Delegates to LinkTrailModuleImpl
// (Swift), which talks to the binary LinkTrailSDK framework. Declared here
// (not in a public header) on purpose — see the note above.
@interface LinkTrailModule : NativeLinkTrailSpecBase <NativeLinkTrailSpec>
@end

@implementation LinkTrailModule {
  LinkTrailModuleImpl *_impl;
}

RCT_EXPORT_MODULE(LinkTrail)

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [LinkTrailModuleImpl new];
    __weak LinkTrailModule *weakSelf = self;
    _impl.onLink = ^(NSDictionary *payload) {
      [weakSelf emitOnLink:payload];
    };
    _impl.onAttribution = ^(NSDictionary *payload) {
      [weakSelf emitOnAttribution:payload];
    };
    _impl.onError = ^(NSDictionary *payload) {
      [weakSelf emitOnError:payload];
    };
  }
  return self;
}

- (void)configure:(NSString *)apiKey
          options:(NSDictionary *)options
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [_impl configure:apiKey
           options:options
           resolve:resolve
            reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)trackInstall:(BOOL)force
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [_impl trackInstall:force
              resolve:resolve
               reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)trackEvent:(NSString *)name
             value:(NSNumber *)value
          currency:(NSString *)currency
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  [_impl trackEvent:name
              value:value
           currency:currency
            resolve:resolve
             reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)trackInstallWithClickToken:(NSString *)clickToken
                             force:(BOOL)force
                           resolve:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
  [_impl trackInstallWithClickToken:clickToken
                              force:force
                            resolve:resolve
                             reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)handleDeepLink:(NSString *)url
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  [_impl handleDeepLink:url
                resolve:resolve
                 reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)getLastAttribution:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  [_impl getLastAttribution:resolve];
}

- (void)getLastDeepLink:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  [_impl getLastDeepLink:resolve];
}

- (void)requestTrackingAuthorization:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject
{
  [_impl requestTrackingAuthorization:resolve
                               reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)registerForSKAdAttribution
{
  [_impl registerForSKAdAttribution];
}

- (void)updateConversionValue:(double)value coarseValue:(NSString *)coarseValue
{
  [_impl updateConversionValue:(NSInteger)llround(value) coarseValue:coarseValue];
}

- (void)setConsent:(BOOL)granted
{
  [_impl setConsent:granted];
}

- (void)resetForTesting
{
  [_impl resetForTesting];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeLinkTrailSpecJSI>(params);
}

@end
