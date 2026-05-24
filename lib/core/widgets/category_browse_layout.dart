import 'package:dpad/dpad.dart';
import 'package:flutter/material.dart';
import 'package:xtream_code_client/xtream_code_client.dart' hide Icon;

import '../widgets/common_widgets.dart';

class CategoryBrowseLayout<T> extends StatelessWidget {
  const CategoryBrowseLayout({
    super.key,
    required this.categories,
    required this.selectedCategory,
    required this.items,
    required this.isLoadingCategories,
    required this.isLoadingItems,
    required this.errorMessage,
    required this.onCategorySelected,
    required this.onRetry,
    required this.emptyMessage,
    required this.itemBuilder,
    this.searchQuery = '',
    this.onSearchChanged,
    this.isLoadingSearch = false,
    this.isSearching = false,
    this.searchHint = 'Search...',
  });

  final List<Category> categories;
  final Category? selectedCategory;
  final List<T> items;
  final bool isLoadingCategories;
  final bool isLoadingItems;
  final bool isLoadingSearch;
  final bool isSearching;
  final String? errorMessage;
  final String searchQuery;
  final String searchHint;
  final ValueChanged<Category> onCategorySelected;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback onRetry;
  final String emptyMessage;
  final Widget Function(BuildContext context, T item) itemBuilder;

  @override
  Widget build(BuildContext context) {
    if (isLoadingCategories) {
      return const LoadingState(message: 'Loading categories...');
    }

    if (errorMessage != null && categories.isEmpty) {
      return ErrorState(message: errorMessage!, onRetry: onRetry);
    }

    if (categories.isEmpty) {
      return EmptyState(message: emptyMessage, icon: Icons.folder_off_outlined);
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!isSearching)
          SizedBox(
            width: 260,
            child: Card(
              margin: const EdgeInsets.all(16),
              child: ListView.builder(
                itemCount: categories.length,
                itemBuilder: (context, index) {
                  final category = categories[index];
                  final selected =
                      category.categoryId == selectedCategory?.categoryId;

                  return DpadFocusable(
                    onSelect: () => onCategorySelected(category),
                    builder: (context, isFocused, child) {
                      return ListTile(
                        selected: selected,
                        title: Text(
                          category.categoryName ?? 'Unnamed',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        tileColor: isFocused
                            ? Theme.of(context)
                                .colorScheme
                                .primary
                                .withValues(alpha: 0.12)
                            : null,
                        onTap: () => onCategorySelected(category),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        Expanded(
          child: Padding(
            padding: EdgeInsets.fromLTRB(isSearching ? 16 : 0, 16, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (onSearchChanged != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: TextField(
                      decoration: InputDecoration(
                        hintText: searchHint,
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: searchQuery.isEmpty
                            ? null
                            : IconButton(
                                tooltip: 'Clear search',
                                onPressed: () => onSearchChanged!(''),
                                icon: const Icon(Icons.close),
                              ),
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                      onChanged: onSearchChanged,
                    ),
                  ),
                Expanded(child: _buildContent(context)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildContent(BuildContext context) {
    if (isLoadingSearch) {
      return const LoadingState(message: 'Loading catalog for search...');
    }

    if (isLoadingItems && !isSearching) {
      return const LoadingState(message: 'Loading content...');
    }

    if (errorMessage != null && items.isEmpty) {
      return ErrorState(message: errorMessage!, onRetry: onRetry);
    }

    if (items.isEmpty) {
      return EmptyState(
        message: isSearching
            ? 'No results for "$searchQuery".'
            : 'No items in this category.',
        icon: isSearching ? Icons.search_off_outlined : Icons.live_tv_outlined,
      );
    }

    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 0.72,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) => itemBuilder(context, items[index]),
    );
  }
}

class ContentTile extends StatelessWidget {
  const ContentTile({
    super.key,
    required this.title,
    required this.imageUrl,
    required this.onTap,
    this.subtitle,
    this.icon = Icons.play_circle_outline,
  });

  final String title;
  final String? subtitle;
  final String? imageUrl;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return DpadFocusable(
      onSelect: onTap,
      builder: (context, isFocused, child) {
        return Card(
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: isFocused
                ? BorderSide(
                    color: Theme.of(context).colorScheme.primary,
                    width: 2,
                  )
                : BorderSide.none,
          ),
          child: InkWell(
            onTap: onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: PosterImage(imageUrl: imageUrl, icon: icon),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
