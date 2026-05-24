import 'package:flutter_test/flutter_test.dart';
import 'package:iptv/data/models/account_status.dart';
import 'package:iptv/data/services/account_status_parser.dart';

void main() {
  test('detects expired when auth is 0 and status is Expired', () {
    final status = AccountStatusParser.fromUserInfo({
      'auth': 0,
      'status': 'Expired',
      'message': 'Your account has expired',
      'exp_date': '1600000000',
    });

    expect(status.kind, AccountStatusKind.expired);
    expect(status.isUsable, isFalse);
    expect(status.message, contains('expired'));
  });

  test('detects expired when auth is 1 but exp_date is in the past', () {
    final status = AccountStatusParser.fromUserInfo({
      'auth': 1,
      'status': 'Active',
      'exp_date': '1000000000',
    });

    expect(status.kind, AccountStatusKind.expired);
    expect(status.isUsable, isFalse);
  });

  test('active account with future expiry', () {
    final future = DateTime.now().add(const Duration(days: 30));
    final epoch = future.millisecondsSinceEpoch ~/ 1000;

    final status = AccountStatusParser.fromUserInfo({
      'auth': 1,
      'status': 'Active',
      'exp_date': '$epoch',
      'max_connections': '2',
      'active_cons': '0',
    });

    expect(status.kind, AccountStatusKind.active);
    expect(status.isUsable, isTrue);
    expect(status.successSummary, isNotNull);
  });

  test('detects banned account', () {
    final status = AccountStatusParser.fromUserInfo({
      'auth': 0,
      'status': 'Banned',
      'message': 'Contact your provider',
    });

    expect(status.kind, AccountStatusKind.banned);
    expect(status.title, 'Account banned');
  });
}
