// REFERENCE COPY (2026-10-30 user-manual screenshots). It ran from the Flutter repo's integration_test/features/
// and was deleted afterwards. EMULATOR ONLY. Drives a seeded demo participant through home "Forms to fill",
// Fill Form and My ATC; prints CAP markers that run-mobile.sh turns into `xcrun simctl io screenshot` captures.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import '../support/e2e_firebase.dart';
import '../support/robot.dart';

const String kWho = String.fromEnvironment('WHO', defaultValue: 'asha');

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const email = String.fromEnvironment('E2E_EMAIL', defaultValue: 'asha.menon@example.com');

  testWidgets('manual screenshots — $kWho', (tester) async {
    final bindingOnError = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails details) {
      final s = details.exceptionAsString();
      if (s.contains('overflowed') || s.contains('RenderFlex') || s.contains('HttpException') || s.contains('SocketException') ||
          s.contains('Failed to load') || s.contains('ink splashes') || s.contains('ListTile')) {
        return;
      }
      bindingOnError?.call(details);
    };
    const target = String.fromEnvironment('QUEUE_E2E_TARGET', defaultValue: 'cloud');
    expect(target, 'emulator', reason: 'EMULATOR ONLY');
    final pid = await e2eInitFirebase();
    expect(kTestProjectIds.contains(pid), isTrue);
    final robot = ParticipantRobot(tester, binding);

    Future<void> scrollUntil(Finder f, {int tries = 25, double dy = -260}) async {
      for (var i = 0; i < tries && f.evaluate().isEmpty; i++) {
        await robot.pumpUntilFound(f, timeout: const Duration(seconds: 2));
        if (f.evaluate().isEmpty) {
          try { await tester.dragFrom(const Offset(200, 560), Offset(0, dy)); } catch (_) {}
        }
      }
    }

    await runZonedGuarded(() async {
      await robot.signIn(email, 'Test!1234');
      await robot.bootApp();
      await robot.pumpFor(const Duration(seconds: 4));
      await robot.screenshot('$kWho-01-home-top');

      final heading = find.text('Forms to fill');
      await scrollUntil(heading);
      if (heading.evaluate().isNotEmpty) {
        await tester.ensureVisible(heading);
        await robot.pumpFor(const Duration(seconds: 2));
        await robot.screenshot('$kWho-02-forms-to-fill');
        final card = find.textContaining(kWho == 'asha' ? 'WiSH Life Report' : 'EI Solution Pre Form');
        if (card.evaluate().isNotEmpty) {
          await tester.tap(card.first, warnIfMissed: false);
          await robot.pumpFor(const Duration(seconds: 6));
          await robot.screenshot('$kWho-03-fill-form');
          if (kWho == 'asha') {
            final fields = find.byType(TextField);
            if (fields.evaluate().isNotEmpty) {
              await tester.enterText(fields.first, 'Steady in the morning, dips after lunch');
              await robot.pumpFor(const Duration(seconds: 1));
              FocusManager.instance.primaryFocus?.unfocus();
              await robot.pumpFor(const Duration(seconds: 2));
              await robot.screenshot('$kWho-04-fill-form-typed');
            }
          }
          final preview = find.byKey(kFormPreviewKey);
          if (preview.evaluate().isNotEmpty) {
            await tester.tap(preview, warnIfMissed: false);
            await robot.pumpFor(const Duration(seconds: 3));
            await robot.screenshot('$kWho-05-preview');
            final confirm = find.byKey(kFormConfirmKey);
            if (kWho == 'asha' && confirm.evaluate().isNotEmpty) {
              await tester.tap(confirm, warnIfMissed: false);
              await robot.pumpFor(const Duration(seconds: 8));
              await robot.screenshot('$kWho-06-after-submit');
            } else {
              await tester.pageBack();
              await robot.pumpFor(const Duration(seconds: 2));
            }
          }
          if (find.text('Fill Form').evaluate().isNotEmpty) {
            await tester.pageBack();
            await robot.pumpFor(const Duration(seconds: 3));
          }
        }
      }

      // My ATC: 5th tab "My Journey" → "View All ATC"
      final tab = find.text('My Journey');
      if (tab.evaluate().isNotEmpty) {
        await tester.tap(tab.last, warnIfMissed: false);
        await robot.pumpFor(const Duration(seconds: 6));
        final link = find.textContaining('View All ATC');
        await scrollUntil(link);
        if (link.evaluate().isNotEmpty) {
          await tester.ensureVisible(link.first);
          await robot.pumpFor(const Duration(seconds: 1));
          await robot.screenshot('$kWho-07-my-journey-atc');
          await tester.tap(link.first, warnIfMissed: false);
          await robot.pumpFor(const Duration(seconds: 8));
          await robot.screenshot('$kWho-08-my-atc');
          final full = find.textContaining('View Full ATC');
          await scrollUntil(full, tries: 6, dy: -200);
          if (full.evaluate().isNotEmpty) {
            await tester.ensureVisible(full.first);
            await tester.tap(full.first, warnIfMissed: false);
            await robot.pumpFor(const Duration(seconds: 4));
            final panel = find.text(kWho == 'asha' ? 'WiSH outcomes' : 'Ask · area of focus');
            if (panel.evaluate().isNotEmpty) {
              await tester.ensureVisible(panel.first);
              await robot.pumpFor(const Duration(seconds: 1));
              try { await tester.dragFrom(const Offset(200, 500), const Offset(0, 120)); } catch (_) {}
              await robot.pumpFor(const Duration(seconds: 2));
            }
            await robot.screenshot('$kWho-09-full-atc');
            try { await tester.dragFrom(const Offset(200, 600), const Offset(0, -380)); } catch (_) {}
            await robot.pumpFor(const Duration(seconds: 2));
            await robot.screenshot('$kWho-10-full-atc-adjustments');
          }
        }
      }
      // ignore: avoid_print
      print('MANUAL DONE');
    }, (e, s) { /* background errors from the minimal seed are not under test */ });
  }, timeout: const Timeout(Duration(minutes: 10)));
}
