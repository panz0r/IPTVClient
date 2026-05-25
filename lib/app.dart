import 'dart:async';
import 'dart:io' show Platform;
import 'dart:ui';

import 'package:dpad/dpad.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_window_close/flutter_window_close.dart';

import 'core/config/app_info.dart';
import 'core/config/app_theme.dart';
import 'core/router/app_router.dart';
import 'providers/auth_provider.dart';

class IptvApp extends ConsumerStatefulWidget {
  const IptvApp({super.key});

  @override
  ConsumerState<IptvApp> createState() => _IptvAppState();
}

class _IptvAppState extends ConsumerState<IptvApp> {
  late final AppLifecycleListener _lifecycleListener;
  bool _shutdownStarted = false;

  @override
  void initState() {
    super.initState();
    _installDesktopWindowCloseHandler();

    _lifecycleListener = AppLifecycleListener(
      onExitRequested: _onExitRequested,
      onDetach: _onDetach,
    );
  }

  void _installDesktopWindowCloseHandler() {
    if (kIsWeb) {
      return;
    }
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      FlutterWindowClose.setWindowShouldCloseHandler(() async {
        await _shutdown();
        return true;
      });
    }
  }

  @override
  void dispose() {
    _lifecycleListener.dispose();
    super.dispose();
  }

  Future<AppExitResponse> _onExitRequested() async {
    await _shutdown();
    return AppExitResponse.exit;
  }

  void _onDetach() {
    unawaited(_shutdown());
  }

  Future<void> _shutdown() async {
    if (_shutdownStarted) {
      return;
    }
    _shutdownStarted = true;
    await ref.read(authProvider.notifier).releaseConnections();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    // D-pad focus trapping can block mouse/desktop interaction on Windows.
    final dpadEnabled = defaultTargetPlatform == TargetPlatform.android;

    return DpadNavigator(
      enabled: dpadEnabled,
      child: MaterialApp.router(
        title: kAppDisplayName,
        theme: AppTheme.dark,
        routerConfig: router,
      ),
    );
  }
}
