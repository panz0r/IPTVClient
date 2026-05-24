bool contentMatchesQuery(String? title, String query) {
  if (query.trim().isEmpty) {
    return true;
  }
  final haystack = (title ?? '').toLowerCase();
  final needle = query.trim().toLowerCase();
  return haystack.contains(needle);
}

List<T> filterContent<T>(
  Iterable<T> items,
  String query,
  String? Function(T item) titleFor,
) {
  if (query.trim().isEmpty) {
    return items.toList();
  }

  return items
      .where((item) => contentMatchesQuery(titleFor(item), query))
      .toList();
}
