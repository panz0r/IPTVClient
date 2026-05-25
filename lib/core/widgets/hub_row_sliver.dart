import 'package:flutter/material.dart';

import 'content_row.dart' as hub;
import 'horizontal_poster_row.dart';

/// One browse row as slivers (title + horizontally scrollable posters).
class HubRowSliver<T> extends StatelessWidget {
  const HubRowSliver({
    super.key,
    required this.title,
    required this.items,
    required this.itemBuilder,
    this.onSeeAll,
  });

  final String title;
  final List<T> items;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: hub.ContentRow(
            title: title,
            itemCount: items.length,
            onSeeAll: onSeeAll,
            showChild: false,
            child: const SizedBox.shrink(),
          ),
        ),
        SliverToBoxAdapter(
          child: HorizontalPosterRow(
            itemCount: items.length,
            itemBuilder: (context, index) => itemBuilder(context, items[index]),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
      ],
    );
  }
}
