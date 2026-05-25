import 'dart:async';

import 'package:flutter/material.dart';

import 'common_widgets.dart';

class StreamingHubLayout extends StatefulWidget {
  const StreamingHubLayout({
    super.key,
    required this.searchHint,
    required this.onSearchChanged,
    required this.isLoading,
    required this.errorMessage,
    required this.onRetry,
    required this.body,
    this.isSearching = false,
    this.isLoadingSearch = false,
    this.searchQuery = '',
    this.banner,
  });

  final String searchHint;
  final ValueChanged<String> onSearchChanged;
  final bool isLoading;
  final bool isLoadingSearch;
  final bool isSearching;
  final String searchQuery;
  final String? errorMessage;
  final VoidCallback onRetry;
  final Widget body;
  final Widget? banner;

  @override
  State<StreamingHubLayout> createState() => _StreamingHubLayoutState();
}

class _StreamingHubLayoutState extends State<StreamingHubLayout> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      widget.onSearchChanged(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) {
      return const LoadingState(message: 'Loading catalog...');
    }

    if (widget.errorMessage != null) {
      return ErrorState(
        message: widget.errorMessage!,
        onRetry: widget.onRetry,
      );
    }

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: widget.searchHint,
                prefixIcon: const Icon(Icons.search),
                suffixIcon: widget.searchQuery.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _searchController.clear();
                          widget.onSearchChanged('');
                        },
                        icon: const Icon(Icons.close),
                      ),
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: _onSearchChanged,
            ),
          ),
        ),
        if (widget.banner != null)
          SliverToBoxAdapter(child: widget.banner!),
        if (widget.isLoadingSearch)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: LinearProgressIndicator(),
            ),
          ),
        SliverToBoxAdapter(child: widget.body),
      ],
    );
  }
}
