import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xtream_code_client/xtream_code_client.dart';

import '../../data/models/playback_request.dart';
import '../../providers/auth_provider.dart';
import '../../features/auth/login_screen.dart';
import '../../features/home/home_shell.dart';
import '../../features/player/player_screen.dart';
import '../../features/series/series_detail_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: _RouterRefresh(ref),
    redirect: (context, state) {
      final location = state.matchedLocation;
      final isLoggingIn = location == '/login';
      final status = authState.status;

      if (status == AuthStatus.unknown || status == AuthStatus.loading) {
        return isLoggingIn ? null : '/login';
      }

      if (status == AuthStatus.authenticated) {
        return isLoggingIn ? '/home' : null;
      }

      return isLoggingIn ? null : '/login';
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeShell(),
      ),
      GoRoute(
        path: '/series/:id',
        builder: (context, state) {
          final series = state.extra;
          if (series is! SeriesItem) {
            return const Scaffold(
              body: Center(child: Text('Series not found.')),
            );
          }
          return SeriesDetailScreen(series: series);
        },
      ),
      GoRoute(
        path: '/player',
        builder: (context, state) {
          final request = state.extra;
          if (request is! PlaybackRequest) {
            return const Scaffold(
              body: Center(child: Text('Playback request missing.')),
            );
          }
          return PlayerScreen(request: request);
        },
      ),
    ],
  );
});

class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(this.ref) {
    ref.listen(authProvider, (_, _) => notifyListeners());
  }

  final Ref ref;
}
