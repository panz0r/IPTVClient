import 'dart:async';

import 'package:flutter/material.dart';

class HubSearchField extends StatefulWidget {
  const HubSearchField({
    super.key,
    required this.hintText,
    required this.onSearchChanged,
    this.searchQuery = '',
  });

  final String hintText;
  final ValueChanged<String> onSearchChanged;
  final String searchQuery;

  @override
  State<HubSearchField> createState() => _HubSearchFieldState();
}

class _HubSearchFieldState extends State<HubSearchField> {
  final _controller = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      widget.onSearchChanged(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: TextField(
        controller: _controller,
        decoration: InputDecoration(
          hintText: widget.hintText,
          prefixIcon: const Icon(Icons.search),
          suffixIcon: widget.searchQuery.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  onPressed: () {
                    _controller.clear();
                    widget.onSearchChanged('');
                  },
                  icon: const Icon(Icons.close),
                ),
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        onChanged: _onChanged,
      ),
    );
  }
}
