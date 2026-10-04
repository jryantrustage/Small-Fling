import cv2, numpy as np
from ocr_engine import get_rapid_ocr

def main():
    img = cv2.imread("dropdown_test.png")
    ocr = get_rapid_ocr()
    res, _ = ocr(img)
    if res:
        for b, txt, s in res:
            pts = np.array(b)
            print(f"'{txt}' ({s}) at [{int(pts[:,0].min())}, {int(pts[:,1].min())}, {int(pts[:,0].max())}, {int(pts[:,1].max())}]")
    else:
        print("No text in entire image!")

if __name__ == "__main__":
    main()
