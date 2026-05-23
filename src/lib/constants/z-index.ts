/**
 * Project-wide z-index hierarchy.
 *
 * Use these constants for any new positioned elements so stacking is explicit
 * and consistent across the app. All values are Tailwind arbitrary-value strings
 * ready to drop into className.
 *
 * Layer       │ Value    │ Who lives here
 * ────────────┼──────────┼─────────────────────────────────────────────────────
 * stickyHeader│ z-10     │ Sticky table/list headers inside scroll containers
 * footerNav   │ z-30     │ MobileFooterNav (always-visible bottom bar)
 * actionBar   │ z-40     │ Fixed action bars / save bars (ConfirmConvocationBar)
 * dropdown    │ z-50     │ Tailwind default — dropdowns, popovers, tooltips
 * snackbar    │ z-[70]   │ UpdateSnackbar (pointer-events-none outer, conditional inner)
 * modal       │ z-[80]   │ First-level modals (ExternalPlayerModal, IOSInstallModal)
 * modalTop    │ z-[90]   │ Modals that appear above other modals (TrainingCreateModal,
 * │          │           │   CalendarEventModal, OpenMapsButton chooser)
 * modalConfirm│ z-[100]  │ Confirmation dialogs nested inside an open modal
 * appModal    │ z-[140]  │ AppModal base component (highest modal priority)
 * mapOverlay  │ z-[500]  │ Absolute overlays INSIDE the Leaflet map shell
 * │          │           │   (must exceed Leaflet's internal z-indexes ~400-500)
 * │          │           │   pointer-events-none ALWAYS — purely visual
 */
export const Z = {
  stickyHeader: "z-10",
  footerNav: "z-30",
  actionBar: "z-40",
  dropdown: "z-50",
  snackbar: "z-[70]",
  modal: "z-[80]",
  modalTop: "z-[90]",
  modalConfirm: "z-[100]",
  appModal: "z-[140]",
  mapOverlay: "z-[500]",
} as const;
