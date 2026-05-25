import 'package:flutter/material.dart';

class ContentRow extends StatelessWidget {
  const ContentRow({
    super.key,
    required this.title,
    required this.child,
    this.onSeeAll,
    this.itemCount,
    this.showChild = true,
  });

  final String title;
  final Widget child;
  final VoidCallback? onSeeAll;
  final int? itemCount;
  final bool showChild;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (onSeeAll != null)
                TextButton(
                  onPressed: onSeeAll,
                  child: Text(
                    itemCount != null ? 'See all ($itemCount)' : 'See all',
                  ),
                ),
            ],
          ),
        ),
        if (showChild) child,
        if (showChild) const SizedBox(height: 8),
      ],
    );
  }
}
