import 'dart:async';

import 'package:media_kit/media_kit.dart';

/// Tracks the active [Player] and runs its teardown when the app exits.
class ActivePlaybackRegistry {
  ActivePlaybackRegistry._();

  static Player? _player;
  static Future<void> Function()? _onEmergencyShutdown;
  static bool _handledByRegistry = false;

  static bool get handledByRegistry => _handledByRegistry;

  /// Registers the player currently streaming. [onEmergencyShutdown] should
  /// stop playback and save watch progress (e.g. from [PlayerScreen]).
  static void register(
    Player player, {
    Future<void> Function()? onEmergencyShutdown,
  }) {
    _player = player;
    _onEmergencyShutdown = onEmergencyShutdown;
    _handledByRegistry = false;
  }

  static void unregister(Player player) {
    if (identical(_player, player)) {
      _player = null;
      _onEmergencyShutdown = null;
    }
  }

  /// Stops active playback and waits for the provider to release the slot.
  static Future<void> stopActivePlayback() async {
    final player = _player;
    final onShutdown = _onEmergencyShutdown;
    _player = null;
    _onEmergencyShutdown = null;

    if (player == null) {
      return;
    }

    _handledByRegistry = true;

    try {
      if (onShutdown != null) {
        await onShutdown().timeout(const Duration(seconds: 8));
      }
    } catch (_) {
      // Fall through to direct player teardown.
    }

    await _forceStopPlayer(player);

    // Active streams often need longer before the panel clears active_cons.
    await Future<void>.delayed(const Duration(milliseconds: 2500));
  }

  static Future<void> _forceStopPlayer(Player player) async {
    try {
      await player.pause().timeout(const Duration(seconds: 3));
    } catch (_) {}

    try {
      await player.stop().timeout(const Duration(seconds: 8));
    } catch (_) {}

    try {
      await player.dispose().timeout(const Duration(seconds: 8));
    } catch (_) {}
  }
}
