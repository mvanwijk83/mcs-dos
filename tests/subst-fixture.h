/* Legacy command fixtures model physical drives only. The dedicated SUBST
 * fixture exercises the production resolver and logical-drive metadata. */
typedef struct Substitution { unsigned char dev, target, length; } Substitution;
#define subst_find(d) ((Substitution *)0)
#define subst_check(d) ((Substitution *)0)
#define subst_begin() ((void)0)
#define subst_remove(d) ((void)0)
#define subst_cwd(d) working[location_index(d)]
#define subst_resolve(p) 1
#define subst_guard(p,m) 1
#define subst_root(p) 0
#define pathdir(p) ((p)->dir)
#define pathdisplay(p,o) uppername((p)->dir,o)
#define substcmd() ((void)0)
#define subst_validating 0
#define subst_diagnostic(m) ((void)0)
