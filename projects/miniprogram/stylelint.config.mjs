/** @type {import('stylelint').Config} */
export default {
  extends: "stylelint-config-standard",
  rules: {
    "selector-type-no-unknown": [
      true,
      {
        ignoreTypes: ["page", "view", "text", "image", "button", "input", "scroll-view"],
      },
    ],
  },
};
