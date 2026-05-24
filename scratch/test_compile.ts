import { Paragraph, ImageRun, AlignmentType, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx';
import * as fs from 'fs';

// 1. Check ImageRun typings
const imgRun = new ImageRun({
    data: Buffer.alloc(0),
    type: "png",
    transformation: {
        width: 500,
        height: 290
    }
});

const p = new Paragraph({
    children: [imgRun],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 120 }
});

// 2. Check Table and TableCell typings without spacing
const table = new Table({
    width: {
        size: 100,
        type: WidthType.PERCENTAGE
    },
    rows: [
        new TableRow({
            children: [
                new TableCell({
                    children: [p],
                    shading: {
                        fill: "F8FAFC"
                    },
                    margins: {
                        top: 140,
                        bottom: 140,
                        left: 200,
                        right: 140
                    },
                    borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                        left: { style: BorderStyle.SINGLE, size: 24, color: "1E293B" },
                        right: { style: BorderStyle.NONE, size: 0, color: "auto" }
                    }
                })
            ]
        })
    ]
});

console.log("Types are perfectly valid!");
