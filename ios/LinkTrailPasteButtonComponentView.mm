// Fabric component view for <LinkTrailPasteButton/>. Registered by naming
// convention: the app's RCTThirdPartyComponentsProvider resolves the JS name
// "LinkTrailPasteButton" to NSClassFromString("LinkTrailPasteButtonComponentView").
// C++/codegen headers are imported only here (never in a public header) so they
// stay out of the pod's Clang module umbrella.
#import <React/RCTViewComponentView.h>
#import <React/RCTConversions.h>

#import <react/renderer/components/LinkTrailSpec/ComponentDescriptors.h>
#import <react/renderer/components/LinkTrailSpec/EventEmitters.h>
#import <react/renderer/components/LinkTrailSpec/Props.h>
#import <react/renderer/components/LinkTrailSpec/RCTComponentViewHelpers.h>

#if __has_include("LinktrailReactNative-Swift.h")
#import "LinktrailReactNative-Swift.h"
#else
#import <LinktrailReactNative/LinktrailReactNative-Swift.h>
#endif

using namespace facebook::react;

@interface LinkTrailPasteButtonComponentView : RCTViewComponentView <RCTLinkTrailPasteButtonViewProtocol>
@end

@implementation LinkTrailPasteButtonComponentView {
  API_AVAILABLE(ios(16.0)) __weak LinkTrailPasteButtonView *_pasteView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<LinkTrailPasteButtonComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const LinkTrailPasteButtonProps>();
    _props = defaultProps;

    if (@available(iOS 16.0, *)) {
      LinkTrailPasteButtonView *pasteView = [LinkTrailPasteButtonView new];
      __weak __typeof(self) weakSelf = self;
      pasteView.onToken = ^(NSString *token) {
        __typeof(self) strongSelf = weakSelf;
        if (strongSelf == nil) {
          return;
        }
        auto emitter = std::static_pointer_cast<const LinkTrailPasteButtonEventEmitter>(strongSelf->_eventEmitter);
        if (emitter) {
          emitter->onTokenPasted({.token = std::string(token.UTF8String)});
        }
      };
      _pasteView = pasteView;
      self.contentView = pasteView;
    }
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<const LinkTrailPasteButtonProps>(props);
  if (@available(iOS 16.0, *)) {
    [_pasteView configureWithDisplayMode:RCTNSStringFromString(toString(newProps.displayMode))
                             cornerStyle:RCTNSStringFromString(toString(newProps.cornerStyle))
                         foregroundColor:RCTUIColorFromSharedColor(newProps.foregroundColor)
                               fillColor:RCTUIColorFromSharedColor(newProps.fillColor)];
  }
  [super updateProps:props oldProps:oldProps];
}

@end

// Referenced (via __attribute__((used))) so the linker keeps the class for the
// runtime NSClassFromString lookup even with dead-code stripping.
Class<RCTComponentViewProtocol> LinkTrailPasteButtonCls(void)
{
  return LinkTrailPasteButtonComponentView.class;
}
