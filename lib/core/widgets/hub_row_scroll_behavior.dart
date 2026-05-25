import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

/// Enables click-and-drag and trackpad scrolling on horizontal hub rows (desktop).
class HubRowScrollBehavior extends MaterialScrollBehavior {
  const HubRowScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.stylus,
        PointerDeviceKind.trackpad,
      };

  @override
  Widget buildScrollbar(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    return child;
  }
}
