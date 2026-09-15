// video-layout.service.unit.spec.ts — unit tests for the picture-in-picture layout state.
//
// WHY UNIT: the service is signals + arithmetic. Angular signals work standalone, so no TestBed — just
// `new VideoLayoutService()`. The quadrant maths behind "snap to nearest corner" is exactly the kind of
// thing that is fiddly to verify by dragging a PiP window around a live call, and trivial to verify here.
import { VideoLayoutService } from './video-layout.service';

describe('VideoLayoutService', () => {
  let svc: VideoLayoutService;
  beforeEach(() => { svc = new VideoLayoutService(); });

  // =============================================================================================
  // SHU-15 — defaults
  // =============================================================================================
  describe('SHU-15 initial state', () => {
    it('starts bottom-right, expanded, with no custom position', () => {
      expect(svc.pipPosition()).toBe('bottom-right');
      expect(svc.isPipMinimized()).toBeFalse();
      expect(svc.pipCustomPosition()).toBeNull();
    });
  });

  // =============================================================================================
  // SHU-16 — minimise toggle
  // =============================================================================================
  describe('SHU-16 togglePipSize', () => {
    it('flips the minimised flag', () => {
      svc.togglePipSize();
      expect(svc.isPipMinimized()).toBeTrue();
      svc.togglePipSize();
      expect(svc.isPipMinimized()).toBeFalse();
    });

    it('returns to the starting state after an even number of toggles', () => {
      const before = svc.isPipMinimized();
      for (let i = 0; i < 6; i++) svc.togglePipSize();
      expect(svc.isPipMinimized()).toBe(before);
    });

    it('does not disturb the corner or the custom position', () => {
      svc.pipCustomPosition.set({ x: 10, y: 10 });
      svc.togglePipSize();
      expect(svc.pipPosition()).toBe('bottom-right');
      expect(svc.pipCustomPosition()).toEqual({ x: 10, y: 10 });
    });
  });

  // =============================================================================================
  // SHU-17 — snap to the nearest corner
  // =============================================================================================
  describe('SHU-17 snapPipToCorner', () => {
    // A 1000x800 container: centre is (500, 400).
    const W = 1000, H = 800;

    it('snaps a point in each quadrant to that quadrant corner', () => {
      svc.snapPipToCorner(W, H, 100, 100);   expect(svc.pipPosition()).toBe('top-left');
      svc.snapPipToCorner(W, H, 900, 100);   expect(svc.pipPosition()).toBe('top-right');
      svc.snapPipToCorner(W, H, 100, 700);   expect(svc.pipPosition()).toBe('bottom-left');
      svc.snapPipToCorner(W, H, 900, 700);   expect(svc.pipPosition()).toBe('bottom-right');
    });

    it('treats the exact centre as bottom-right', () => {
      // The comparisons are `< centre` for left/top and `>=` for right/bottom, so the centre point itself
      // and both centre lines fall to the right/bottom side. Pinned so the boundary is not ambiguous.
      svc.snapPipToCorner(W, H, 500, 400);
      expect(svc.pipPosition()).toBe('bottom-right');
    });

    it('puts a point exactly on the vertical centre line on the right', () => {
      svc.snapPipToCorner(W, H, 500, 100);
      expect(svc.pipPosition()).toBe('top-right');
    });

    it('puts a point exactly on the horizontal centre line at the bottom', () => {
      svc.snapPipToCorner(W, H, 100, 400);
      expect(svc.pipPosition()).toBe('bottom-left');
    });

    it('clears any custom drag position, so the corner takes over', () => {
      // Without this the PiP would snap visually but keep rendering at the dragged coordinates.
      svc.pipCustomPosition.set({ x: 123, y: 456 });
      svc.snapPipToCorner(W, H, 900, 700);
      expect(svc.pipCustomPosition()).toBeNull();
    });

    it('handles a zero-sized container without throwing', () => {
      // Container dimensions come from the DOM and can be 0 before layout settles.
      expect(() => svc.snapPipToCorner(0, 0, 0, 0)).not.toThrow();
      expect(svc.pipPosition()).toBe('bottom-right');
    });

    it('handles negative coordinates by snapping to the top-left', () => {
      // A drag can overshoot the container edge.
      svc.snapPipToCorner(W, H, -50, -50);
      expect(svc.pipPosition()).toBe('top-left');
    });
  });
});
