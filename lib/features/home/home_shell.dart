import 'package:flutter/material.dart';

import '../../core/config/app_info.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/live/live_screen.dart';
import '../../features/movies/movies_screen.dart';
import '../../features/series/series_screen.dart';
import '../../providers/auth_provider.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _selectedIndex = 0;

  static const _tabs = [
    (icon: Icons.live_tv_outlined, label: 'Live TV'),
    (icon: Icons.movie_outlined, label: 'Movies'),
    (icon: Icons.video_library_outlined, label: 'Series'),
  ];

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(authProvider).accountStatus;

    return Scaffold(
      appBar: AppBar(
        title: const Text(kAppDisplayName),
        actions: [
          IconButton(
            tooltip: 'Log out',
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (account?.successSummary != null)
            MaterialBanner(
              content: Text(account!.successSummary!),
              leading: const Icon(Icons.verified_user_outlined),
              actions: const [SizedBox.shrink()],
            ),
          Expanded(
            child: switch (_selectedIndex) {
              0 => const LiveScreen(),
              1 => const MoviesScreen(),
              _ => const SeriesScreen(),
            },
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) => setState(() => _selectedIndex = index),
        destinations: [
          for (final tab in _tabs)
            NavigationDestination(
              icon: Icon(tab.icon),
              label: tab.label,
            ),
        ],
      ),
    );
  }
}
