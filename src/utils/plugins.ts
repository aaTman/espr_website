import { defineHastPlugin } from "satteri";
import type { Element, Text, Root, Properties } from "hast";

export const imageCaptions = defineHastPlugin({
  name: "image-captions",
  element: {
    filter: ["img"],
    visit(node, ctx) {
      const title = node.properties.title;
      
      if (typeof title === "string") {
        // 1. Create a new image node without the title property
        // We must copy properties to avoid mutating the read-only node directly
        const { title: _, ...imgProps } = node.properties;
        
        const newImg: Element = {
          type: "element",
          tagName: "img",
          properties: imgProps,
          children: [] // img tags are self-closing/void
        };

        // 2. Create the figcaption node
        // The child of figcaption must be a Text node, not a raw string
        const captionText: Text = {
          type: "text",
          value: title
        };

        const caption: Element = {
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: [captionText]
        };

        // 3. Create the figure wrapper
        const figure: Element = {
          type: "element",
          tagName: "figure",
          properties: {},
          children: [newImg, caption]
        };

        // 4. Replace the original image node
        ctx.replaceNode(node, figure);
      }
    },
  },
});   