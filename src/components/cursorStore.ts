// Vanilla JS mutable object to hold 60FPS data outside of React's lifecycle
export const cursorState = {
  x: -100,
  y: -100,
  isActive: false, // Flag to know if hand or mouse is moving
  isPinching: false // Flag when user pinches (thumb + index touching)
};