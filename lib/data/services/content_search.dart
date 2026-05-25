import 'genre_grouper.dart';

bool contentMatchesQuery({
  required String query,
  String? title,
  String? genre,
  String? cast,
  String? actors,
}) {
  if (query.trim().isEmpty) {
    return true;
  }

  final needle = query.trim().toLowerCase();
  if (title != null && title.toLowerCase().contains(needle)) {
    return true;
  }
  if (genre != null) {
    if (genre.toLowerCase().contains(needle)) {
      return true;
    }
    for (final part in parseGenres(genre)) {
      if (part.toLowerCase().contains(needle)) {
        return true;
      }
    }
  }
  for (final field in [cast, actors]) {
    if (field != null && field.toLowerCase().contains(needle)) {
      return true;
    }
  }
  return false;
}

bool contentMatchesQueryTitle(String? title, String query) {
  return contentMatchesQuery(query: query, title: title);
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
      .where((item) => contentMatchesQueryTitle(titleFor(item), query))
      .toList();
}

List<T> filterContentMultiField<T>(
  Iterable<T> items,
  String query, {
  required String? Function(T item) titleFor,
  String? Function(T item)? genreFor,
  String? Function(T item)? castFor,
  String? Function(T item)? actorsFor,
}) {
  if (query.trim().isEmpty) {
    return items.toList();
  }

  return items
      .where(
        (item) => contentMatchesQuery(
          query: query,
          title: titleFor(item),
          genre: genreFor?.call(item),
          cast: castFor?.call(item),
          actors: actorsFor?.call(item),
        ),
      )
      .toList();
}
