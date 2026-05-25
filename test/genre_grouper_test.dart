import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/services/genre_grouper.dart';

void main() {
  test('parseGenres splits comma and pipe separated values', () {
    expect(parseGenres('Action, Drama'), ['Action', 'Drama']);
    expect(parseGenres('Horror|Thriller'), ['Horror', 'Thriller']);
  });

  test('parseGenres keeps ampersand labels intact', () {
    expect(parseGenres('Sci-Fi & Fantasy'), ['Sci-Fi & Fantasy']);
    expect(parseGenres('Action, Sci-Fi & Fantasy'), [
      'Action',
      'Sci-Fi & Fantasy',
    ]);
  });

  test('groupByGenre includes all items when no maxItemsPerRow', () {
    final items = List.generate(
      10,
      (i) => _GenreItem(genre: i < 6 ? 'Action' : 'Drama'),
    );

    final rows = groupByGenre(
      items: items,
      genreFor: (item) => item.genre,
      minItemsPerRow: 1,
    );

    expect(rows.length, 2);
    expect(rows.first.title, 'Action');
    expect(rows.first.items.length, 6);
    expect(rows.last.items.length, 4);
  });

  test('groupByGenre respects maxRows when set', () {
    final items = List.generate(
      10,
      (i) => _GenreItem(genre: i < 6 ? 'Action' : 'Drama'),
    );

    final rows = groupByGenre(
      items: items,
      genreFor: (item) => item.genre,
      minItemsPerRow: 3,
      maxRows: 1,
    );

    expect(rows.length, 1);
  });
}

class _GenreItem {
  _GenreItem({required this.genre});

  final String genre;
}
