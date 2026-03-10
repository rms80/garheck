// client/js/HUD.js
// Updates HP bars, timer, round display

export class HUD {
  constructor() {
    this.hp1Bar = document.getElementById('hp1');
    this.hp2Bar = document.getElementById('hp2');
    this.hp1Text = document.getElementById('hp1Text');
    this.hp2Text = document.getElementById('hp2Text');
    this.roundText = document.getElementById('roundText');
    this.timerText = document.getElementById('timerText');
  }

  updateHP(p1HP, p2HP) {
    if (this.hp1Bar) {
      this.hp1Bar.style.width = `${Math.max(0, p1HP)}%`;
      this.hp1Text.textContent = `${Math.ceil(Math.max(0, p1HP))}`;
    }
    if (this.hp2Bar) {
      this.hp2Bar.style.width = `${Math.max(0, p2HP)}%`;
      this.hp2Text.textContent = `${Math.ceil(Math.max(0, p2HP))}`;
    }
  }

  updateRound(round, scores) {
    if (this.roundText) {
      const dots0 = '●'.repeat(scores[0]) + '○'.repeat(2 - scores[0]);
      const dots1 = '●'.repeat(scores[1]) + '○'.repeat(2 - scores[1]);
      this.roundText.textContent = `${dots0}  Round ${round}  ${dots1}`;
    }
  }

  updateTimer(seconds) {
    if (this.timerText) {
      const mins = Math.floor(Math.max(0, seconds) / 60);
      const secs = Math.floor(Math.max(0, seconds) % 60);
      this.timerText.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }
}
