import { APP_THEMES, appNameError, isAppTheme, segmentsUsing, widgetKey } from './app-widgets.service';

describe('app name (the key the app maps to its widget)', () => {
  it('accepts one lowercase word, digits allowed after the first letter', () => {
    expect(appNameError('upcomingevents')).toBeNull();
    expect(appNameError('arena30days')).toBeNull();
  });

  it('refuses capitals, spaces, symbols, a leading digit or nothing', () => {
    for (const bad of ['UpcomingEvents', 'upcoming events', 'upcoming-events', 'upcoming_events', '30days', '']) {
      expect(appNameError(bad)).withContext(bad).not.toBeNull();
    }
  });
});

describe('app widgets contract', () => {
  it('knows the three colours only', () => {
    expect(APP_THEMES.map(t => t.key)).toEqual(['blue', 'magenta', 'purple']);
    expect(isAppTheme('purple')).toBeTrue();
    expect(isAppTheme('')).toBeFalse();
    expect(isAppTheme(undefined)).toBeFalse();
  });

  it('finds the segments whose Home layout uses a widget', () => {
    const segs = [
      { id: 's1', name: 'Pre uP!', tabwidgets: { home: ['w1', 'w2'] } },
      { id: 's2', name: 'In line', tabwidgets: { home: ['w2'] } },
      { id: 's3', name: 'No layout', tabwidgets: {} },
      { id: 's4', name: 'Odd data', tabwidgets: { home: 'w1' } as any },
    ];
    expect(segmentsUsing('w1', segs).map(s => s.id)).toEqual(['s1']);
    expect(segmentsUsing('w2', segs).map(s => s.id)).toEqual(['s1', 's2']);
    expect(segmentsUsing('w9', segs)).toEqual([]);
  });

  it('treats names that differ only by case or spacing as the same widget', () => {
    expect(widgetKey('  Upcoming   Events ')).toBe(widgetKey('upcoming events'));
    expect(widgetKey('Quote')).not.toBe(widgetKey('Quotes'));
  });
});
