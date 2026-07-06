package io.linktrail.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LinkTrailPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == LinkTrailModule.NAME) LinkTrailModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        LinkTrailModule.NAME to ReactModuleInfo(
          name = LinkTrailModule.NAME,
          className = LinkTrailModule::class.java.name,
          canOverrideExistingModule = false,
          needsEagerInit = false,
          isCxxModule = false,
          isTurboModule = true,
        )
      )
    }
}
