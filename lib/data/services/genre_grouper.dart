import 'package:xtream_code_client/xtream_code_client.dart';

class HubContentRow<T> {
  const HubContentRow({
    required this.id,
    required this.title,
    required this.items,
  });

  final String id;
  final String title;
  final List<T> items;
}

/// Splits multi-genre strings on comma, pipe, or slash only.
/// Provider labels like "Sci-Fi & Fantasy" stay as one genre.
List<String> parseGenres(String? genreString) {
  if (genreString == null || genreString.trim().isEmpty) {
    return [];
  }

  return genreString
      .split(RegExp(r'[,|/]'))
      .map((g) => g.trim())
      .where((g) => g.isNotEmpty)
      .toList();
}

List<HubContentRow<T>> groupByGenre<T>({
  required List<T> items,
  required String? Function(T item) genreFor,
  int? maxRows,
  int minItemsPerRow = 1,
  int? maxItemsPerRow,
}) {
  final buckets = <String, List<T>>{};

  for (final item in items) {
    final genres = parseGenres(genreFor(item));
    if (genres.isEmpty) {
      continue;
    }
    for (final genre in genres) {
      final key = genre.toLowerCase();
      buckets.putIfAbsent(key, () => []).add(item);
    }
  }

  final sortedKeys = buckets.keys.toList()
    ..sort((a, b) => buckets[b]!.length.compareTo(buckets[a]!.length));

  final rows = <HubContentRow<T>>[];
  for (final key in sortedKeys) {
    if (maxRows != null && rows.length >= maxRows) {
      break;
    }
    final bucketItems = buckets[key]!;
    if (bucketItems.length < minItemsPerRow) {
      continue;
    }
    final displayName = _displayGenreName(bucketItems, genreFor, key);
    rows.add(
      HubContentRow<T>(
        id: 'genre:$key',
        title: displayName,
        items: _limitItems(bucketItems, maxItemsPerRow),
      ),
    );
  }

  return rows;
}

List<HubContentRow<T>> groupByCategory<T>({
  required List<T> items,
  required int? Function(T item) categoryIdFor,
  required Map<int, String> categoryNames,
  Iterable<int>? Function(T item)? categoryIdsFor,
  int? maxRows,
  int minItemsPerRow = 1,
  int? maxItemsPerRow,
}) {
  final buckets = <int, List<T>>{};

  for (final item in items) {
    final ids = categoryIdsFor?.call(item)?.toList() ??
        [
          if (categoryIdFor(item) != null) categoryIdFor(item)!,
        ];
    if (ids.isEmpty) {
      continue;
    }
    for (final id in ids) {
      buckets.putIfAbsent(id, () => []).add(item);
    }
  }

  final sortedIds = buckets.keys.toList()
    ..sort((a, b) {
      final nameA = categoryNames[a] ?? '';
      final nameB = categoryNames[b] ?? '';
      final byName = nameA.toLowerCase().compareTo(nameB.toLowerCase());
      if (byName != 0) {
        return byName;
      }
      return buckets[b]!.length.compareTo(buckets[a]!.length);
    });

  final rows = <HubContentRow<T>>[];
  for (final id in sortedIds) {
    if (maxRows != null && rows.length >= maxRows) {
      break;
    }
    final bucketItems = buckets[id]!;
    if (bucketItems.length < minItemsPerRow) {
      continue;
    }
    final name = categoryNames[id] ?? 'Category $id';
    rows.add(
      HubContentRow<T>(
        id: 'category:$id',
        title: name,
        items: _limitItems(bucketItems, maxItemsPerRow),
      ),
    );
  }

  return rows;
}

/// One row per provider category (preserves API order), with all matching items.
List<HubContentRow<T>> groupByProviderCategories<T>({
  required List<T> items,
  required List<Category> categories,
  required Iterable<int> Function(T item) categoryIdsFor,
  int minItemsPerRow = 1,
  int? maxItemsPerRow,
}) {
  final buckets = <int, List<T>>{};

  for (final item in items) {
    for (final id in categoryIdsFor(item)) {
      buckets.putIfAbsent(id, () => []).add(item);
    }
  }

  final rows = <HubContentRow<T>>[];
  for (final category in categories) {
    final id = category.categoryId;
    if (id == null) {
      continue;
    }
    final bucketItems = buckets[id];
    if (bucketItems == null || bucketItems.length < minItemsPerRow) {
      continue;
    }
    rows.add(
      HubContentRow<T>(
        id: 'category:$id',
        title: category.categoryName ?? 'Unnamed category',
        items: _limitItems(bucketItems, maxItemsPerRow),
      ),
    );
  }

  return rows;
}

/// Items with no category assignment.
List<HubContentRow<T>> uncategorizedRow<T>({
  required List<T> items,
  required Iterable<int> Function(T item) categoryIdsFor,
  String title = 'Other',
}) {
  final uncategorized = items
      .where((item) => categoryIdsFor(item).isEmpty)
      .toList();
  if (uncategorized.isEmpty) {
    return [];
  }

  return [
    HubContentRow<T>(
      id: 'uncategorized',
      title: title,
      items: uncategorized,
    ),
  ];
}

List<HubContentRow<T>> recentlyAddedRow<T>({
  required List<T> items,
  required DateTime? Function(T item) dateFor,
  String title = 'Recently added',
  int? maxItems,
}) {
  final sorted = items.toList()
    ..sort((a, b) {
      final da = dateFor(a);
      final db = dateFor(b);
      if (da == null && db == null) {
        return 0;
      }
      if (da == null) {
        return 1;
      }
      if (db == null) {
        return -1;
      }
      return db.compareTo(da);
    });

  final withDates = sorted.where((item) => dateFor(item) != null);
  final limited = maxItems != null ? withDates.take(maxItems) : withDates;
  final list = limited.toList();
  if (list.isEmpty) {
    return [];
  }

  return [
    HubContentRow<T>(
      id: 'recent',
      title: title,
      items: list,
    ),
  ];
}

List<T> _limitItems<T>(List<T> items, int? maxItemsPerRow) {
  if (maxItemsPerRow == null) {
    return List<T>.from(items);
  }
  return items.take(maxItemsPerRow).toList();
}

String _displayGenreName<T>(
  List<T> items,
  String? Function(T item) genreFor,
  String normalizedKey,
) {
  for (final item in items) {
    for (final genre in parseGenres(genreFor(item))) {
      if (genre.toLowerCase() == normalizedKey) {
        return genre;
      }
    }
  }
  return normalizedKey;
}

/// Collects category ids from [categoryId] and [categoryIds] fields.
Iterable<int> vodCategoryIds(VodItem item) sync* {
  final seen = <int>{};
  if (item.categoryIds != null) {
    for (final id in item.categoryIds!) {
      if (seen.add(id)) {
        yield id;
      }
    }
  }
  final primary = item.categoryId;
  if (primary != null && seen.add(primary)) {
    yield primary;
  }
}

Iterable<int> seriesCategoryIds(SeriesItem item) sync* {
  final seen = <int>{};
  if (item.categoryIds != null) {
    for (final id in item.categoryIds!) {
      if (seen.add(id)) {
        yield id;
      }
    }
  }
  final primary = item.categoryId;
  if (primary != null && seen.add(primary)) {
    yield primary;
  }
}
