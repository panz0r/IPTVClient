import 'package:flutter/material.dart';

import '../../core/widgets/common_widgets.dart';
import '../../core/widgets/poster_card.dart';

class HubBrowseScreen<T> extends StatelessWidget {
  const HubBrowseScreen({
    super.key,
    required this.title,
    required this.items,
    required this.itemBuilder,
  });

  final String title;
  final List<T> items;
  final Widget Function(BuildContext context, T item) itemBuilder;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: items.isEmpty
          ? const EmptyState(message: 'No titles in this row.')
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 180,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 0.55,
              ),
              itemCount: items.length,
              itemBuilder: (context, index) =>
                  itemBuilder(context, items[index]),
            ),
    );
  }
}

class HubPosterGridTile extends StatelessWidget {
  const HubPosterGridTile({
    super.key,
    required this.title,
    required this.imageUrl,
    required this.onTap,
    this.subtitle,
    this.icon = Icons.movie_outlined,
  });

  final String title;
  final String? subtitle;
  final String? imageUrl;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PosterCard(
      title: title,
      subtitle: subtitle,
      imageUrl: imageUrl,
      icon: icon,
      width: double.infinity,
      onTap: onTap,
    );
  }
}
