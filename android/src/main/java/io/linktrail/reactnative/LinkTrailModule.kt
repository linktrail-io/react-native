package io.linktrail.reactnative

import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap
import io.linktrail.LinkTrail
import io.linktrail.LinkTrailError
import io.linktrail.LinkTrailLogLevel
import io.linktrail.LinkTrailOptions
import io.linktrail.LinkTrailRetryPolicy
import io.linktrail.model.LinkTrailAttribution
import io.linktrail.model.LinkTrailDeepLink
import io.linktrail.model.LinkTrailLinkSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class LinkTrailModule(reactContext: ReactApplicationContext) :
  NativeLinkTrailSpec(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  override fun invalidate() {
    scope.cancel()
    super.invalidate()
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  override fun configure(apiKey: String, options: ReadableMap?, promise: Promise) {
    try {
      val sdk = LinkTrail.configure(reactApplicationContext, apiKey, parseOptions(options))
      sdk.onAttribution { attribution -> emitOnAttribution(attributionToMap(attribution)) }
      sdk.onLink { link, source ->
        emitOnLink(
          Arguments.createMap().apply {
            putMap("link", deepLinkToMap(link))
            putString("source", sourceName(source))
          }
        )
      }
      sdk.onError { error ->
        emitOnError(
          Arguments.createMap().apply {
            putString("code", errorCode(error))
            putString("message", error.message ?: "Unknown error")
          }
        )
      }
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject(errorCode(t), t.message, t)
    }
  }

  // ── Install / events ───────────────────────────────────────────────────────

  override fun trackInstall(force: Boolean, promise: Promise) {
    val sdk = requireSdk(promise) ?: return
    scope.launch {
      try {
        promise.resolve(attributionToMap(sdk.trackInstallAsync(force)))
      } catch (t: Throwable) {
        promise.reject(errorCode(t), t.message, t)
      }
    }
  }

  override fun trackInstallWithClickToken(clickToken: String, force: Boolean, promise: Promise) {
    // Android has no clipboard click token (attribution uses the Play Install
    // Referrer), so the token is ignored — a plain install.
    val sdk = requireSdk(promise) ?: return
    scope.launch {
      try {
        promise.resolve(attributionToMap(sdk.trackInstallAsync(force)))
      } catch (t: Throwable) {
        promise.reject(errorCode(t), t.message, t)
      }
    }
  }

  override fun trackEvent(name: String, value: Double?, currency: String?, promise: Promise) {
    val sdk = requireSdk(promise) ?: return
    scope.launch {
      try {
        val result = sdk.trackEventAsync(name, value, currency)
        promise.resolve(
          Arguments.createMap().apply {
            result.id?.let { putInt("id", it) }
            putBoolean("attributed", result.attributed)
          }
        )
      } catch (t: Throwable) {
        promise.reject(errorCode(t), t.message, t)
      }
    }
  }

  // ── Deep linking ───────────────────────────────────────────────────────────

  override fun handleDeepLink(url: String, promise: Promise) {
    val sdk = requireSdk(promise) ?: return
    scope.launch {
      try {
        promise.resolve(deepLinkToMap(sdk.handleDeepLinkAsync(Uri.parse(url))))
      } catch (e: LinkTrailError.NotALinkTrailUrl) {
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject(errorCode(t), t.message, t)
      }
    }
  }

  override fun getLastAttribution(promise: Promise) {
    promise.resolve(LinkTrail.shared?.lastAttribution?.let(::attributionToMap))
  }

  override fun getLastDeepLink(promise: Promise) {
    promise.resolve(LinkTrail.shared?.lastDeepLink?.let(::deepLinkToMap))
  }

  // ── iOS-only APIs (no-ops on Android) ──────────────────────────────────────

  override fun requestTrackingAuthorization(promise: Promise) {
    promise.resolve(false)
  }

  override fun registerForSKAdAttribution() = Unit

  override fun updateConversionValue(value: Double, coarseValue: String?) = Unit

  // ── Consent ──────────────────────────────────────────────────────────────

  override fun setConsent(granted: Boolean) {
    LinkTrail.shared?.setConsent(granted)
  }

  // ── Testing ────────────────────────────────────────────────────────────────

  override fun resetForTesting() {
    LinkTrail.resetForTesting(reactApplicationContext)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private fun requireSdk(promise: Promise): LinkTrail? {
    val sdk = LinkTrail.shared
    if (sdk == null) {
      promise.reject(
        "not_configured",
        "LinkTrail is not configured. Call LinkTrail.configure(apiKey) first."
      )
    }
    return sdk
  }

  private fun parseOptions(map: ReadableMap?): LinkTrailOptions {
    if (map == null) return LinkTrailOptions()
    val defaults = LinkTrailOptions()

    val retryMap = if (map.hasKey("retryPolicy")) map.getMap("retryPolicy") else null
    val defaultRetry = LinkTrailRetryPolicy.DEFAULT
    val retryPolicy = if (retryMap == null) defaultRetry else LinkTrailRetryPolicy(
      maxAttempts = retryMap.intOrDefault("maxAttempts", defaultRetry.maxAttempts),
      baseDelayMillis = retryMap.longOrDefault("baseDelayMillis", defaultRetry.baseDelayMillis),
      maxDelayMillis = retryMap.longOrDefault("maxDelayMillis", defaultRetry.maxDelayMillis),
    )

    val linkDomains = mutableListOf<String>()
    if (map.hasKey("linkDomains")) {
      map.getArray("linkDomains")?.let { array ->
        for (i in 0 until array.size()) array.getString(i)?.let(linkDomains::add)
      }
    }

    return LinkTrailOptions(
      logEnabled = map.booleanOrDefault("logEnabled", defaults.logEnabled),
      logLevel = logLevel(map.stringOrNull("logLevel"), defaults.logLevel),
      requestTimeoutMillis = map.longOrDefault("requestTimeoutMillis", defaults.requestTimeoutMillis),
      retryPolicy = retryPolicy,
      linkDomains = linkDomains,
      autoTrackInstall = map.booleanOrDefault("autoTrackInstall", defaults.autoTrackInstall),
      requireConsent = map.booleanOrDefault("requireConsent", defaults.requireConsent),
      // clickTokenSource is iOS-only (Android uses the Play Install Referrer) — ignored here.
    )
  }

  private fun logLevel(name: String?, fallback: LinkTrailLogLevel): LinkTrailLogLevel =
    when (name) {
      "debug" -> LinkTrailLogLevel.DEBUG
      "info" -> LinkTrailLogLevel.INFO
      "warning" -> LinkTrailLogLevel.WARNING
      "error" -> LinkTrailLogLevel.ERROR
      "none" -> LinkTrailLogLevel.NONE
      else -> fallback
    }

  private fun sourceName(source: LinkTrailLinkSource): String = when (source) {
    LinkTrailLinkSource.DEFERRED -> "deferred"
    LinkTrailLinkSource.REENGAGEMENT -> "reengagement"
  }

  private fun attributionToMap(attribution: LinkTrailAttribution): WritableMap =
    Arguments.createMap().apply {
      attribution.id?.let { putInt("id", it) }
      putBoolean("attributed", attribution.attributed)
      attribution.deepLink?.let { putMap("deepLink", deepLinkToMap(it)) }
    }

  private fun deepLinkToMap(link: LinkTrailDeepLink): WritableMap =
    Arguments.createMap().apply {
      link.slug?.let { putString("slug", it) }
      link.url?.let { putString("url", it) }
      link.deepLinkPath?.let { putString("deepLinkPath", it) }
      link.iosUrl?.let { putString("iosUrl", it) }
      link.androidUrl?.let { putString("androidUrl", it) }
      link.fallbackUrl?.let { putString("fallbackUrl", it) }
      link.campaign?.let { putString("campaign", it) }
      link.channel?.let { putString("channel", it) }
      link.utm?.let { putMap("utm", stringMapToMap(it)) }
      link.customData?.let { putMap("customData", stringMapToMap(it)) }
      putString("path", link.path)
      putBoolean("hasRoutableDestination", link.hasRoutableDestination)
    }

  private fun stringMapToMap(values: Map<String, String>): WritableMap =
    Arguments.createMap().apply {
      values.forEach { (key, value) -> putString(key, value) }
    }

  private fun errorCode(error: Throwable): String = when (error) {
    is LinkTrailError.MissingApiKey -> "missing_api_key"
    is LinkTrailError.InvalidApiKey -> "invalid_api_key"
    is LinkTrailError.Transport -> "transport"
    is LinkTrailError.Server -> "server"
    is LinkTrailError.Decoding -> "decoding"
    is LinkTrailError.EmptyResponse -> "empty_response"
    is LinkTrailError.InvalidUrl -> "invalid_url"
    is LinkTrailError.NotALinkTrailUrl -> "not_a_linktrail_url"
    else -> "unknown"
  }

  private fun ReadableMap.booleanOrDefault(key: String, fallback: Boolean): Boolean =
    if (hasKey(key) && getType(key) == ReadableType.Boolean) getBoolean(key) else fallback

  private fun ReadableMap.intOrDefault(key: String, fallback: Int): Int =
    if (hasKey(key) && getType(key) == ReadableType.Number) getInt(key) else fallback

  private fun ReadableMap.longOrDefault(key: String, fallback: Long): Long =
    if (hasKey(key) && getType(key) == ReadableType.Number) getDouble(key).toLong() else fallback

  private fun ReadableMap.stringOrNull(key: String): String? =
    if (hasKey(key) && getType(key) == ReadableType.String) getString(key) else null

  companion object {
    const val NAME = "LinkTrail"
  }
}
