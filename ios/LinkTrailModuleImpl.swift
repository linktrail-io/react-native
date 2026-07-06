import Foundation
import LinkTrailSDK

/// Swift half of the LinkTrail TurboModule. The ObjC++ module (LinkTrailModule.mm)
/// cannot call the Swift-only LinkTrailSDK directly, so this class exposes an
/// @objc surface with dictionary payloads and closure-based promises.
@objc(LinkTrailModuleImpl)
public final class LinkTrailModuleImpl: NSObject {

  public typealias Resolve = (Any?) -> Void
  public typealias Reject = (String, String) -> Void

  /// Event sinks wired up by the ObjC++ module to the codegen emitters.
  @objc public var onLink: ((NSDictionary) -> Void)?
  @objc public var onAttribution: ((NSDictionary) -> Void)?
  @objc public var onError: ((NSDictionary) -> Void)?

  private var sdk: LinkTrailSDK.LinkTrail? { LinkTrailSDK.LinkTrail.shared }

  // MARK: - Configuration

  @objc public func configure(
    _ apiKey: String,
    options: NSDictionary?,
    resolve: @escaping Resolve,
    reject: @escaping Reject
  ) {
    do {
      let sdk = try LinkTrailSDK.LinkTrail.configure(apiKey: apiKey, options: Self.parseOptions(options))
      sdk.onAttribution { [weak self] attribution in
        self?.onAttribution?(Self.attributionDict(attribution))
      }
      sdk.onLink { [weak self] link, source in
        self?.onLink?([
          "link": Self.deepLinkDict(link),
          "source": Self.sourceName(source),
        ])
      }
      sdk.onError { [weak self] error in
        self?.onError?([
          "code": Self.errorCode(error),
          "message": error.localizedDescription,
        ])
      }
      resolve(nil)
    } catch {
      reject(Self.errorCode(error), error.localizedDescription)
    }
  }

  // MARK: - Install / events

  @objc public func trackInstall(
    _ force: Bool,
    resolve: @escaping Resolve,
    reject: @escaping Reject
  ) {
    guard let sdk = requireSDK(reject) else { return }
    Task {
      do {
        resolve(Self.attributionDict(try await sdk.trackInstall(force: force)))
      } catch {
        reject(Self.errorCode(error), error.localizedDescription)
      }
    }
  }

  @objc public func trackEvent(
    _ name: String,
    value: NSNumber?,
    currency: String?,
    resolve: @escaping Resolve,
    reject: @escaping Reject
  ) {
    guard let sdk = requireSDK(reject) else { return }
    Task {
      do {
        let result = try await sdk.trackEvent(name: name, value: value?.doubleValue, currency: currency)
        var dict: [String: Any] = ["attributed": result.attributed]
        if let id = result.id { dict["id"] = id }
        resolve(dict)
      } catch {
        reject(Self.errorCode(error), error.localizedDescription)
      }
    }
  }

  // MARK: - Deep linking

  @objc public func handleDeepLink(
    _ urlString: String,
    resolve: @escaping Resolve,
    reject: @escaping Reject
  ) {
    guard let sdk = requireSDK(reject) else { return }
    guard let url = URL(string: urlString) else {
      resolve(nil) // unparseable → not a LinkTrail link
      return
    }
    Task {
      do {
        resolve(Self.deepLinkDict(try await sdk.handleDeepLink(url)))
      } catch LinkTrailError.notALinkTrailURL {
        resolve(nil)
      } catch {
        reject(Self.errorCode(error), error.localizedDescription)
      }
    }
  }

  @objc public func getLastAttribution(_ resolve: @escaping Resolve) {
    resolve(sdk?.lastAttribution.map(Self.attributionDict))
  }

  @objc public func getLastDeepLink(_ resolve: @escaping Resolve) {
    resolve(sdk?.lastDeepLink.map(Self.deepLinkDict))
  }

  // MARK: - ATT / SKAdNetwork

  @objc public func requestTrackingAuthorization(
    _ resolve: @escaping Resolve,
    reject: @escaping Reject
  ) {
    guard let sdk = requireSDK(reject) else { return }
    Task {
      resolve(await sdk.requestTrackingAuthorization())
    }
  }

  @objc public func registerForSKAdAttribution() {
    sdk?.registerForSKAdAttribution()
  }

  @objc public func updateConversionValue(_ value: Int, coarseValue: String?) {
    let coarse = coarseValue.flatMap(LinkTrailCoarseConversionValue.init(rawValue:))
    sdk?.updateConversionValue(value, coarseValue: coarse)
  }

  // MARK: - Testing

  @objc public func resetForTesting() {
    LinkTrailSDK.LinkTrail.resetForTesting()
  }

  // MARK: - Helpers

  private func requireSDK(_ reject: Reject) -> LinkTrailSDK.LinkTrail? {
    guard let sdk else {
      reject("not_configured", "LinkTrail is not configured. Call LinkTrail.configure(apiKey) first.")
      return nil
    }
    return sdk
  }

  private static func parseOptions(_ dict: NSDictionary?) -> LinkTrailOptions {
    guard let dict else { return LinkTrailOptions() }
    let defaults = LinkTrailOptions()

    let defaultRetry = LinkTrailRetryPolicy.default
    var retryPolicy = defaultRetry
    if let retry = dict["retryPolicy"] as? NSDictionary {
      retryPolicy = LinkTrailRetryPolicy(
        maxAttempts: (retry["maxAttempts"] as? NSNumber)?.intValue ?? defaultRetry.maxAttempts,
        baseDelay: (retry["baseDelayMillis"] as? NSNumber).map { $0.doubleValue / 1000 } ?? defaultRetry.baseDelay,
        maxDelay: (retry["maxDelayMillis"] as? NSNumber).map { $0.doubleValue / 1000 } ?? defaultRetry.maxDelay
      )
    }

    return LinkTrailOptions(
      logEnabled: (dict["logEnabled"] as? NSNumber)?.boolValue ?? defaults.logEnabled,
      logLevel: logLevel(dict["logLevel"] as? String) ?? defaults.logLevel,
      requestTimeout: (dict["requestTimeoutMillis"] as? NSNumber).map { $0.doubleValue / 1000 } ?? defaults.requestTimeout,
      retryPolicy: retryPolicy,
      linkDomains: (dict["linkDomains"] as? [Any])?.compactMap { $0 as? String } ?? defaults.linkDomains,
      autoTrackInstall: (dict["autoTrackInstall"] as? NSNumber)?.boolValue ?? defaults.autoTrackInstall
    )
  }

  private static func logLevel(_ name: String?) -> LinkTrailLogLevel? {
    switch name {
    case "debug": return .debug
    case "info": return .info
    case "warning": return .warning
    case "error": return .error
    case "none": return LinkTrailLogLevel.none
    default: return nil
    }
  }

  private static func sourceName(_ source: LinkTrailLinkSource) -> String {
    switch source {
    case .deferred: return "deferred"
    case .reengagement: return "reengagement"
    @unknown default: return "reengagement"
    }
  }

  private static func attributionDict(_ attribution: LinkTrailAttribution) -> NSDictionary {
    var dict: [String: Any] = ["attributed": attribution.attributed]
    if let id = attribution.id { dict["id"] = id }
    if let deepLink = attribution.deepLink { dict["deepLink"] = deepLinkDict(deepLink) }
    return dict as NSDictionary
  }

  private static func deepLinkDict(_ link: LinkTrailDeepLink) -> NSDictionary {
    var dict: [String: Any] = [
      "path": link.path,
      "hasRoutableDestination": link.hasRoutableDestination,
    ]
    if let slug = link.slug { dict["slug"] = slug }
    if let url = link.url { dict["url"] = url }
    if let deepLinkPath = link.deepLinkPath { dict["deepLinkPath"] = deepLinkPath }
    if let iosURL = link.iosURL { dict["iosUrl"] = iosURL }
    if let androidURL = link.androidURL { dict["androidUrl"] = androidURL }
    if let fallbackURL = link.fallbackURL { dict["fallbackUrl"] = fallbackURL }
    if let campaign = link.campaign { dict["campaign"] = campaign }
    if let channel = link.channel { dict["channel"] = channel }
    if let utm = link.utm { dict["utm"] = utm }
    if let customData = link.customData { dict["customData"] = customData }
    return dict as NSDictionary
  }

  private static func errorCode(_ error: Error) -> String {
    guard let error = error as? LinkTrailError else { return "unknown" }
    switch error {
    case .invalidURL: return "invalid_url"
    case .transport: return "transport"
    case .server: return "server"
    case .decoding: return "decoding"
    case .emptyResponse: return "empty_response"
    case .notALinkTrailURL: return "not_a_linktrail_url"
    case .missingAPIKey: return "missing_api_key"
    case .invalidAPIKey: return "invalid_api_key"
    @unknown default: return "unknown"
    }
  }
}
