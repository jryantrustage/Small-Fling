-'typescript'
import React from 'react';
import  ImageUploader } from 'commonui';
import { nonHookTypedTranslation } from 'i18n';
import { postCoreProductImage } from 'components/CoreProduct/api';

export interface ComponentFactory {
  createComponent(idx?: number): JSX.Element;
}

export class ImageUploaderFactory implements ComponentFactory
  private altImageText: string;

  private allowableFileFormats: string[l;

  private imageType: string;

  private imageWidth: number;

  private imageHeight: number;

  private getImage?: ({ image, mediaUrl }: any) => void;

  private readOnly?: boolean;

  private mediaUrl?: string;

  private key?: string;

  constructor(
readOnly: boolean,
tenantId: string,
onImageUpload: (func: (context: any) => void) => Promise<any>,
mediaUrl?: string,
key?: string,
  } {
this.altImageText = nonHookTypedTranslation('IMAGE_UPLOADER__ALT_PRODUCT');
this.imageType = 'Product';
this.imageWidth = 720;
this.imageHeight = 314;
this.allowableFileFormats = ['.png', '.jpeg', '.jpg', '.gif'];
this.readOnly = readOnly;
this.mediaUrl = mediaUrl;
this.key = key;
this.getImage = ({ image }) => {
if (image) {
onImageUpload((context) => {
const { productId, props } = context;
const { tenant } = props;
return postCoreProductImage(image, tenant.id, productId);
        }];
}
};
}

  public createComponent(): JSX.Element {
return (
<ImageUploader
key={this.key}
altImageText={this.altImageText}

imageWidth={this.imageWidth}
imageHeight={this.imageHeight}
allowableFileFormats={this.allowableFileFormats}
getImage={this.getImage}
readOnly={this.readOnly}
defaultImageUrl={this.mediaUrl}
      [>
    };
}
}
