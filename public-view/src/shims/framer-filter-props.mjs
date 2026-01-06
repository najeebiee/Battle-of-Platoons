import { isValidMotionProp } from "framer-motion/dist/es/motion/utils/valid-prop.mjs";
import isPropValid from "@emotion/is-prop-valid";

let shouldForward = (key) => !isValidMotionProp(key);

function loadExternalIsValidProp(isValidProp) {
  if (typeof isValidProp !== "function") return;
  // Explicitly filter our events
  shouldForward = (key) => (key.startsWith("on") ? !isValidMotionProp(key) : isValidProp(key));
}

// Bind the Emotion/STC prop validator when available (via static ESM import, no require()).
if (typeof isPropValid === "function") {
  loadExternalIsValidProp(isPropValid);
}

function filterProps(props, isDom, forwardMotionProps) {
  const filteredProps = {};

  for (const key in props) {
    if (key === "values" && typeof props.values === "object") continue;

    if (
      shouldForward(key) ||
      (forwardMotionProps === true && isValidMotionProp(key)) ||
      (!isDom && !isValidMotionProp(key)) ||
      (props["draggable"] && key.startsWith("onDrag"))
    ) {
      filteredProps[key] = props[key];
    }
  }

  return filteredProps;
}

export { filterProps, loadExternalIsValidProp };
