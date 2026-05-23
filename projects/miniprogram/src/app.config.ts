export default defineAppConfig({
  pages: ["pages/index/index", "pages/order-meal/index", "pages/checkout/index", "pages/table-orders/index"],
  subpackages: [
    {
      root: "subpackages/profile",
      pages: ["pages/history-orders/index", "pages/order-detail/index", "pages/profile-edit/index"],
    },
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "BiteGo 点点餐",
    navigationBarTextStyle: "black",
  },
});
