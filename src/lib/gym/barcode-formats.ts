import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/**
 * What a product barcode actually looks like, told to the decoder up front.
 *
 * Left to itself the reader tries every format it knows — QR, Data Matrix,
 * Aztec, PDF417 and a dozen others — on every frame. A shop barcode is none of
 * those, so that work is spent failing, and the one format that could have
 * matched gets a fraction of the time. Naming the handful that appear on
 * groceries is the difference between "it doesn't scan" and a read in a second.
 *
 * ITF is in the list because it turns up on multipacks and cases.
 */
export const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
];

/** TRY_HARDER costs time per frame and finds codes that are small, angled or poorly lit. */
export function retailBarcodeHints(): Map<DecodeHintType, unknown> {
  return new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS],
    [DecodeHintType.TRY_HARDER, true],
  ]);
}

/**
 * Ask for the sharpest picture the camera will give.
 *
 * Without this the browser hands over whatever it likes, often 640x480. An
 * EAN-13 held at arm's length is then a few pixels per bar, which no decoder
 * can read — the camera looks like it is working and nothing ever scans.
 * `ideal` rather than `exact` so a camera that can't manage it still starts.
 */
export function cameraConstraints(): MediaStreamConstraints {
  return {
    video: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  };
}
