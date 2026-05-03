class Timer {
    constructor(displayElement, onComplete) {
        this.displayElement = displayElement;
        this.onComplete = onComplete;
        this.intervalId = null;
        this.remainingSeconds = 0;
        this.isHidden = false;
    }

    start(minutes) {
        this.stop();
        this.remainingSeconds = minutes * 60;
        this.updateDisplay();

        this.intervalId = setInterval(() => {
            this.remainingSeconds--;
            this.updateDisplay();

            if (this.remainingSeconds <= 0) {
                this.stop();
                if (this.onComplete) this.onComplete();
            }
        }, 1000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    updateDisplay() {
        if (!this.displayElement) return;

        const m = Math.floor(this.remainingSeconds / 60);
        const s = this.remainingSeconds % 60;
        
        const displayString = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        if (this.isHidden) {
            this.displayElement.textContent = "Timer Hidden";
            this.displayElement.classList.remove('warning', 'danger');
        } else {
            this.displayElement.textContent = displayString;
            
            // Warnings
            if (this.remainingSeconds <= 60) {
                this.displayElement.classList.add('danger');
                this.displayElement.classList.remove('warning');
            } else if (this.remainingSeconds <= 300) {
                this.displayElement.classList.add('warning');
                this.displayElement.classList.remove('danger');
            } else {
                this.displayElement.classList.remove('warning', 'danger');
            }
        }
    }

    toggleVisibility() {
        this.isHidden = !this.isHidden;
        this.updateDisplay();
        return this.isHidden;
    }
}
