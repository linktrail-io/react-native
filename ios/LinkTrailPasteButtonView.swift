import UIKit
import LinkTrailSDK

/// The native content of the `<LinkTrailPasteButton/>` Fabric component: an Apple
/// `UIPasteControl` that reads a LinkTrail deferred click token from the clipboard
/// (no "Allow Paste" alert) and hands it to the SDK via `trackInstall(clickToken:)`.
/// Appearance is driven by the RN props (`displayMode`/`cornerStyle`/colors);
/// size comes from the RN `style`. iOS 16+.
@available(iOS 16.0, *)
@objc(LinkTrailPasteButtonView)
public final class LinkTrailPasteButtonView: UIView {

  /// Called on the main thread with the raw pasted string after the SDK reads it.
  @objc public var onToken: ((String) -> Void)?

  private var coordinator: PasteCoordinator?
  private weak var control: UIPasteControl?

  // Current appearance (RN props). Defaults mirror the JS/codegen defaults.
  private var displayModeName = "labelOnly"
  private var cornerStyleName = "capsule"
  private var foregroundColor: UIColor?
  private var fillColor: UIColor?

  public override init(frame: CGRect) {
    super.init(frame: frame)
    rebuild()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  /// Applies appearance props from RN. No-ops if nothing changed (avoids flicker).
  @objc public func configure(
    displayMode: String,
    cornerStyle: String,
    foregroundColor: UIColor?,
    fillColor: UIColor?
  ) {
    let unchanged =
      displayMode == displayModeName &&
      cornerStyle == cornerStyleName &&
      foregroundColor == self.foregroundColor &&
      fillColor == self.fillColor
    if control != nil && unchanged { return }

    displayModeName = displayMode
    cornerStyleName = cornerStyle
    self.foregroundColor = foregroundColor
    self.fillColor = fillColor
    rebuild()
  }

  private func rebuild() {
    control?.removeFromSuperview()

    let coord = coordinator ?? PasteCoordinator { [weak self] token in self?.onToken?(token) }
    coordinator = coord

    let configuration = UIPasteControl.Configuration()
    configuration.displayMode = Self.displayMode(displayModeName)
    configuration.cornerStyle = Self.cornerStyle(cornerStyleName)
    if let foregroundColor { configuration.baseForegroundColor = foregroundColor }
    if let fillColor { configuration.baseBackgroundColor = fillColor }

    let control = UIPasteControl(configuration: configuration)
    control.target = coord
    control.translatesAutoresizingMaskIntoConstraints = false
    addSubview(control)
    NSLayoutConstraint.activate([
      control.leadingAnchor.constraint(equalTo: leadingAnchor),
      control.trailingAnchor.constraint(equalTo: trailingAnchor),
      control.topAnchor.constraint(equalTo: topAnchor),
      control.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    self.control = control
  }

  private static func displayMode(_ name: String) -> UIPasteControl.DisplayMode {
    switch name {
    case "iconAndLabel": return .iconAndLabel
    case "iconOnly": return .iconOnly
    default: return .labelOnly
    }
  }

  private static func cornerStyle(_ name: String) -> UIButton.Configuration.CornerStyle {
    switch name {
    case "dynamic": return .dynamic
    case "fixed": return .fixed
    case "large": return .large
    case "medium": return .medium
    case "small": return .small
    default: return .capsule
    }
  }

  /// The `UIPasteControl` target: accepts pasted text and forwards it to the SDK.
  final class PasteCoordinator: UIResponder {
    private let onToken: (String) -> Void

    init(onToken: @escaping (String) -> Void) {
      self.onToken = onToken
      super.init()
      pasteConfiguration = UIPasteConfiguration(forAccepting: NSString.self)
    }

    override func paste(itemProviders: [NSItemProvider]) {
      guard let provider = itemProviders.first(where: { $0.canLoadObject(ofClass: NSString.self) }) else { return }
      let onToken = self.onToken
      provider.loadObject(ofClass: NSString.self) { object, _ in
        guard let string = object as? String else { return }
        LinkTrailSDK.LinkTrail.shared?.trackInstall(clickToken: string)
        DispatchQueue.main.async { onToken(string) }
      }
    }
  }
}
