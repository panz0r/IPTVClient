import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/services/content_search.dart';

void main() {
  test('filterContent matches case-insensitively', () {
    final results = filterContent(
      ['BBC One', 'CNN', 'SVT1'],
      'bbc',
      (item) => item,
    );

    expect(results, ['BBC One']);
  });

  test('empty query returns all items', () {
    final items = ['A', 'B'];
    expect(filterContent(items, '', (item) => item), items);
  });

  test('contentMatchesQuery matches genre and cast', () {
    expect(
      contentMatchesQuery(
        query: 'action',
        title: 'Other',
        genre: 'Action, Adventure',
      ),
      isTrue,
    );
    expect(
      contentMatchesQuery(
        query: 'tom hanks',
        title: 'Forrest Gump',
        actors: 'Tom Hanks, Robin Wright',
      ),
      isTrue,
    );
    expect(
      contentMatchesQuery(
        query: 'nolan',
        title: 'Inception',
        cast: 'Leonardo DiCaprio',
      ),
      isFalse,
    );
  });

  test('filterContentMultiField searches across fields', () {
    final results = filterContentMultiField(
      [
        (title: 'Show A', genre: 'Drama', cast: null),
        (title: 'Show B', genre: 'Comedy', cast: 'Jane Doe'),
      ],
      'jane',
      titleFor: (r) => r.title,
      genreFor: (r) => r.genre,
      castFor: (r) => r.cast,
    );

    expect(results.length, 1);
    expect(results.first.title, 'Show B');
  });
}
