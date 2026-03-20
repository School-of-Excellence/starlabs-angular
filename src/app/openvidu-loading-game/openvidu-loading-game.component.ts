import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-openvidu-loading-game',
  imports: [CommonModule],
  templateUrl: './openvidu-loading-game.component.html',
  styleUrl: './openvidu-loading-game.component.css'
})
export class OpenviduLoadingGameComponent {

  statusMessage = 'Starting servers...';
  score = 0;
  progress = 0;
  targets: Array<{id: number, x: number, y: number}> = [];
  private gameInterval: any;
  private progressInterval: any;



  ngOnInit() {
    this.startGame();
    this.simulateProgress();
  }

   ngOnDestroy() {
    if (this.gameInterval) clearInterval(this.gameInterval);
    if (this.progressInterval) clearInterval(this.progressInterval);
  }
  
  startGame() {
    // Spawn targets every second
    this.gameInterval = setInterval(() => {
      this.spawnTarget();
    }, 1000);

    // Initial targets
    this.spawnTarget();
    this.spawnTarget();
  }

  spawnTarget() {
    const id = Date.now();
    const x = Math.random() * 350; // 400 - 50 (target size)
    const y = Math.random() * 250; // 300 - 50
    
    this.targets.push({ id, x, y });

    // Remove target after 3 seconds if not clicked
    setTimeout(() => {
      this.targets = this.targets.filter(t => t.id !== id);
    }, 3000);
  }

  hitTarget(id: number) {
    this.targets = this.targets.filter(t => t.id !== id);
    this.score += 10;
  }

  onBoardClick(event: MouseEvent) {
    // Optional: penalize for missing
    if (this.score > 0) this.score -= 2;
  }

  simulateProgress() {
    // Simulate room preparation progress
    const messages = [
      'Starting servers...',
      'Initializing infrastructure...',
      'Creating meeting room...',
      'Almost ready...'
    ];

    let messageIndex = 0;
    let currentProgress = 0;

    this.progressInterval = setInterval(() => {
      currentProgress += Math.random() * 15;
      
      if (currentProgress > 100) {
        currentProgress = 100;
        clearInterval(this.progressInterval);
      }

      this.progress = currentProgress;

      // Update message
      const newIndex = Math.floor((currentProgress / 100) * messages.length);
      if (newIndex < messages.length) {
        this.statusMessage = messages[newIndex];
      }
    }, 500);
  }

}
