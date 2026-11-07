#ifndef MCS_DIR_FILTER_H
#define MCS_DIR_FILTER_H
/* Keep the filter in one byte across bank gates: low five bits select a
 * CBM type (30 = image, 31 = any); high bits select D/L and inversion.
 * 255 remains the ordinary, unfiltered listing used by existing callers. */
#define DIR_TYPE_MASK 31
#define DIR_IMAGES 30
#define DIR_ATTR_D 32
#define DIR_ATTR_L 64
#define DIR_ATTR_NOT 128
#define DIR_RECURSE_DIR(f) ((f) != 255 && ((f) & DIR_ATTR_D) && !((f) & DIR_ATTR_NOT))
#define DIR_ACCESS(i) (directory_locks[(i) >> 3] & (1 << ((i) & 7)) ? CBM_A_RO : CBM_A_RW)
#define DIR_ATTRIBUTE(f, t, a) \
    (((f) & DIR_ATTR_L) ? ((a) == CBM_A_RO) : ((t) == CBM_T_DIR || (t) == CBM_T_CBM))
#define DIR_MATCH(f, n, t, a) \
    ((f) == 255 || \
     ((((f) & DIR_TYPE_MASK) == DIR_TYPE_MASK || \
       (((f) & DIR_TYPE_MASK) == DIR_IMAGES ? \
        ((t) != CBM_T_DIR && (t) != CBM_T_CBM && imagekind(n)) : \
        (t) == ((f) & DIR_TYPE_MASK))) && \
      (!((f) & (DIR_ATTR_D | DIR_ATTR_L)) || \
       (((f) & DIR_ATTR_NOT) ? !DIR_ATTRIBUTE(f, t, a) : DIR_ATTRIBUTE(f, t, a)))))
#endif
