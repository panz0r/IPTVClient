import 'package:dpad/dpad.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_theme.dart';
import 'core/router/app_router.dart';

class IptvApp extends ConsumerWidget {
  const IptvApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return DpadNavigator(
      child: MaterialApp.router(
        title: 'IPTV Player',
        theme: AppTheme.dark,
        routerConfig: router,
      ),
    );
  }
}
