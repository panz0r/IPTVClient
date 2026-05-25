import 'package:dpad/dpad.dart';
import 'package:flutter/material.dart';

import 'common_widgets.dart';

class PosterCard extends StatelessWidget {
  const PosterCard({
    super.key,
    required this.title,
    required this.imageUrl,
    required this.onTap,
    this.subtitle,
    this.icon = Icons.movie_outlined,
    this.width = 130,
    this.progress,
  });

  final String title;
  final String? subtitle;
  final String? imageUrl;
  final IconData icon;
  final VoidCallback onTap;
  final double width;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: DpadFocusable(
        onSelect: onTap,
        builder: (context, isFocused, child) {
          return InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final heightCapped = constraints.maxHeight.isFinite &&
                    constraints.maxHeight > 0;

                final poster = ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      PosterImage(imageUrl: imageUrl, icon: icon),
                      if (isFocused)
                        DecoratedBox(
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: Theme.of(context).colorScheme.primary,
                              width: 2,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      if (progress != null && progress! > 0)
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: LinearProgressIndicator(
                            value: progress!.clamp(0.0, 1.0),
                            minHeight: 3,
                            backgroundColor: Colors.black26,
                          ),
                        ),
                    ],
                  ),
                );

                final labels = Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                      ),
                    ],
                  ],
                );

                if (heightCapped) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: poster),
                      const SizedBox(height: 6),
                      labels,
                    ],
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AspectRatio(aspectRatio: 2 / 3, child: poster),
                    const SizedBox(height: 6),
                    labels,
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }
}
